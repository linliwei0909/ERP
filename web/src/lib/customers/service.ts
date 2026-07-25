import {
  Prisma,
  type Customer,
  type CustomerCompany,
  type CustomerContact,
  type DeliveryLocation,
  type PrismaClient,
} from "@/generated/prisma/client";
import { systemAuditContext, writeAudit } from "@/lib/audit";
import { requireAdminWithAudit, requirePermission } from "@/lib/auth/authorization";
import { hasRole } from "@/lib/auth/rbac";
import {
  CompanyAccessError,
  hasCompanyAccess,
} from "@/lib/auth/company-scope";
import type { RequestContext } from "@/lib/auth/session";
import {
  executeIdempotent,
  type IdempotentResult,
} from "@/lib/idempotency";
import {
  buildFullAddress,
  customerCompanyInputSchema,
  customerContactInputSchema,
  customerInputSchema,
  customerListQuerySchema,
  deliveryLocationInputSchema,
  normalizeCode,
  normalizeTaxId,
} from "@/lib/customers/validation";
import { z } from "zod";

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

type CustomerInput = z.input<typeof customerInputSchema>;
type CustomerCompanyInput = z.input<typeof customerCompanyInputSchema>;
type CustomerContactInput = z.input<typeof customerContactInputSchema>;
type DeliveryLocationInput = z.input<typeof deliveryLocationInputSchema>;

export class CustomerNotFoundError extends Error {
  readonly code = "CUSTOMER_NOT_FOUND";
  constructor() {
    super("找不到可使用的客戶");
  }
}

export class CustomerChildNotFoundError extends Error {
  readonly code = "CUSTOMER_CHILD_NOT_FOUND";
  constructor(entity: string) {
    super(`找不到指定的${entity}`);
  }
}

export class CustomerConstraintError extends Error {
  readonly code = "CUSTOMER_CONSTRAINT_CONFLICT";
  constructor(message = "客戶資料違反唯一或完整性限制") {
    super(message);
  }
}

export type CustomerWriteResult = {
  id: string;
  replayed: boolean;
};

function replayResult(
  result: IdempotentResult<{ id: string }>,
): CustomerWriteResult {
  if (result.replayed) {
    if (!result.resultReference) {
      throw new Error("冪等操作缺少結果識別碼");
    }
    return { id: result.resultReference, replayed: true };
  }
  return { id: result.value.id, replayed: false };
}

function isConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    ["P2002", "P2003", "P2004"].includes(error.code)
  );
}

function customerSnapshot(customer: Customer) {
  return {
    id: customer.id,
    customerType: customer.customerType,
    name: customer.name,
    taxId: customer.taxId,
    normalizedTaxId: customer.normalizedTaxId,
    countryCode: customer.countryCode,
    foreignIdentifier: customer.foreignIdentifier,
    status: customer.status,
    createdBy: customer.createdById,
    updatedBy: customer.updatedById,
    createdAt: customer.createdAt.toISOString(),
    updatedAt: customer.updatedAt.toISOString(),
  };
}

function customerCompanySnapshot(relation: CustomerCompany) {
  return {
    id: relation.id,
    customerId: relation.customerId,
    companyId: relation.companyId,
    customerCode: relation.customerCode,
    normalizedCustomerCode: relation.normalizedCustomerCode,
    status: relation.status,
    createdBy: relation.createdById,
    updatedBy: relation.updatedById,
    createdAt: relation.createdAt.toISOString(),
    updatedAt: relation.updatedAt.toISOString(),
  };
}

function contactSnapshot(contact: CustomerContact) {
  return {
    id: contact.id,
    customerId: contact.customerId,
    name: contact.name,
    department: contact.department,
    jobTitle: contact.jobTitle,
    phone: contact.phone,
    mobile: contact.mobile,
    email: contact.email,
    notes: contact.notes,
    isPrimary: contact.isPrimary,
    status: contact.status,
    createdBy: contact.createdById,
    updatedBy: contact.updatedById,
    createdAt: contact.createdAt.toISOString(),
    updatedAt: contact.updatedAt.toISOString(),
  };
}

function locationSnapshot(location: DeliveryLocation) {
  return {
    id: location.id,
    customerId: location.customerId,
    code: location.code,
    name: location.name,
    recipientName: location.recipientName,
    phone: location.phone,
    postalCode: location.postalCode,
    city: location.city,
    district: location.district,
    addressLine: location.addressLine,
    fullAddress: location.fullAddress,
    notes: location.notes,
    isDefault: location.isDefault,
    status: location.status,
    createdBy: location.createdById,
    updatedBy: location.updatedById,
    createdAt: location.createdAt.toISOString(),
    updatedAt: location.updatedAt.toISOString(),
  };
}

async function requireCustomerAccess(
  db: PrismaClient,
  context: RequestContext,
  companyId: string,
  mode: "read" | "write",
): Promise<void> {
  if (mode === "write") {
    await requireAdminWithAudit(db, context);
  } else {
    requirePermission(context, "customers.read");
  }

  const authorizedCompanyIds = context.authorizedCompanies.map(
    (company) => company.id,
  );
  if (!hasCompanyAccess(authorizedCompanyIds, companyId)) {
    await db.$transaction((tx) =>
      writeAudit(tx, {
        ...systemAuditContext({
          companyId: context.selectedCompany?.id,
          actorUserId: context.actor.userId,
          sessionId: context.session.sessionId,
          requestId: context.requestId,
        }),
        entityType: "company",
        entityId: companyId,
        operation: "auth.company.denied",
        metadata: { requestedCompanyId: companyId, resource: "customer" },
      }),
    );
    throw new CompanyAccessError();
  }
}

async function requireActiveCustomerRelation(
  tx: Prisma.TransactionClient,
  customerId: string,
  companyId: string,
) {
  const relation = await tx.customerCompany.findFirst({
    where: {
      customerId,
      companyId,
      status: "ACTIVE",
      customer: { status: "ACTIVE" },
    },
  });
  if (!relation) throw new CustomerNotFoundError();
  return relation;
}

function writeInput(input: {
  context: RequestContext;
  companyId: string;
  idempotencyKey: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  return {
    userId: input.context.actor.userId,
    expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS),
    now,
  };
}

function auditContext(input: {
  context: RequestContext;
  companyId: string;
}) {
  return systemAuditContext({
    companyId: input.companyId,
    actorUserId: input.context.actor.userId,
    sessionId: input.context.session.sessionId,
    requestId: input.context.requestId,
  });
}

export async function listCustomers(
  db: PrismaClient,
  input: {
    context: RequestContext;
    companyId: string;
    query?: unknown;
  },
) {
  await requireCustomerAccess(db, input.context, input.companyId, "read");
  const query = customerListQuerySchema.parse(input.query ?? {});
  const isAdmin = hasRole(input.context.roleCodes, "ADMIN");
  const effectiveStatus = isAdmin ? query.status : "ACTIVE";
  const normalizedSearch = normalizeCode(query.search);
  const where: Prisma.CustomerWhereInput = {
    ...(effectiveStatus === "ALL" ? {} : { status: effectiveStatus }),
    companyRelations: {
      some: {
        companyId: input.companyId,
        status:
          isAdmin && effectiveStatus !== "ACTIVE" ? undefined : "ACTIVE",
      },
    },
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: "insensitive" } },
            { normalizedTaxId: { contains: normalizeTaxId(query.search) ?? "" } },
            {
              companyRelations: {
                some: {
                  companyId: input.companyId,
                  normalizedCustomerCode: { contains: normalizedSearch },
                },
              },
            },
          ],
        }
      : {}),
  };
  const [total, customers] = await db.$transaction([
    db.customer.count({ where }),
    db.customer.findMany({
      where,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        companyRelations: {
          where: { companyId: input.companyId },
          select: {
            companyId: true,
            customerCode: true,
            status: true,
          },
        },
      },
    }),
  ]);
  return {
    items: customers,
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    },
  };
}

export async function getCustomer(
  db: PrismaClient,
  input: {
    context: RequestContext;
    companyId: string;
    customerId: string;
    includeInactive?: boolean;
  },
) {
  await requireCustomerAccess(db, input.context, input.companyId, "read");
  const includeInactive =
    Boolean(input.includeInactive) &&
    hasRole(input.context.roleCodes, "ADMIN");
  const customer = await db.customer.findFirst({
    where: {
      id: input.customerId,
      ...(includeInactive ? {} : { status: "ACTIVE" }),
      companyRelations: {
        some: {
          companyId: input.companyId,
          ...(includeInactive ? {} : { status: "ACTIVE" }),
        },
      },
    },
    include: {
      companyRelations: {
        where: {
          companyId: {
            in: input.context.authorizedCompanies.map((company) => company.id),
          },
        },
        include: { company: { select: { code: true, name: true } } },
        orderBy: { company: { code: "asc" } },
      },
      contacts: {
        where: includeInactive ? {} : { status: "ACTIVE" },
        orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
      },
      deliveryLocations: {
        where: includeInactive ? {} : { status: "ACTIVE" },
        orderBy: [{ isDefault: "desc" }, { code: "asc" }],
      },
    },
  });
  if (!customer) throw new CustomerNotFoundError();
  return customer;
}

export async function createCustomer(
  db: PrismaClient,
  input: {
    context: RequestContext;
    companyId: string;
    customer: CustomerInput;
    customerCode: string;
    idempotencyKey: string;
    now?: Date;
  },
): Promise<CustomerWriteResult> {
  await requireCustomerAccess(db, input.context, input.companyId, "write");
  const customer = customerInputSchema.parse(input.customer);
  const relation = customerCompanyInputSchema.parse({
    customerCode: input.customerCode,
  });
  const common = writeInput(input);

  try {
    return replayResult(
      await executeIdempotent(
        db,
        {
          companyId: input.companyId,
          userId: common.userId,
          operation: "customer.create",
          key: input.idempotencyKey,
          payload: { customer, customerCode: relation.customerCode },
          expiresAt: common.expiresAt,
          now: common.now,
        },
        async (tx) => {
          const created = await tx.customer.create({
            data:
              customer.customerType === "DOMESTIC"
                ? {
                    customerType: customer.customerType,
                    name: customer.name,
                    taxId: customer.taxId,
                    normalizedTaxId: normalizeTaxId(customer.taxId),
                    createdById: common.userId,
                    updatedById: common.userId,
                  }
                : {
                    customerType: customer.customerType,
                    name: customer.name,
                    countryCode: customer.countryCode,
                    foreignIdentifier: customer.foreignIdentifier,
                    createdById: common.userId,
                    updatedById: common.userId,
                  },
          });
          const companyRelation = await tx.customerCompany.create({
            data: {
              customerId: created.id,
              companyId: input.companyId,
              customerCode: relation.customerCode,
              normalizedCustomerCode: normalizeCode(relation.customerCode),
              createdById: common.userId,
              updatedById: common.userId,
            },
          });
          await writeAudit(tx, {
            ...auditContext(input),
            entityType: "customer",
            entityId: created.id,
            operation: "customer.created",
            afterJson: customerSnapshot(created),
          });
          await writeAudit(tx, {
            ...auditContext(input),
            entityType: "customer_company",
            entityId: companyRelation.id,
            operation: "customer_company.created",
            afterJson: customerCompanySnapshot(companyRelation),
          });
          return {
            value: { id: created.id },
            responseStatus: 201,
            responseMetadata: { id: created.id },
            resultReference: created.id,
          };
        },
      ),
    );
  } catch (error) {
    if (isConstraintError(error)) throw new CustomerConstraintError();
    throw error;
  }
}

export async function updateCustomer(
  db: PrismaClient,
  input: {
    context: RequestContext;
    companyId: string;
    customerId: string;
    customer: CustomerInput & { status: "ACTIVE" | "INACTIVE" };
    idempotencyKey: string;
    now?: Date;
  },
): Promise<CustomerWriteResult> {
  await requireCustomerAccess(db, input.context, input.companyId, "write");
  const { status, ...customerData } = input.customer;
  const parsed = customerInputSchema.parse(customerData);
  const parsedStatus = z.enum(["ACTIVE", "INACTIVE"]).parse(status);
  const common = writeInput(input);

  try {
    return replayResult(
      await executeIdempotent(
        db,
        {
          companyId: input.companyId,
          userId: common.userId,
          operation: "customer.update",
          key: input.idempotencyKey,
          payload: {
            customerId: input.customerId,
            customer: parsed,
            status: parsedStatus,
          },
          expiresAt: common.expiresAt,
          now: common.now,
        },
        async (tx) => {
          const existing = await tx.customer.findFirst({
            where: {
              id: input.customerId,
              companyRelations: {
                some: { companyId: input.companyId },
              },
            },
          });
          if (!existing) throw new CustomerNotFoundError();
          const updated = await tx.customer.update({
            where: { id: existing.id },
            data:
              parsed.customerType === "DOMESTIC"
                ? {
                    customerType: parsed.customerType,
                    name: parsed.name,
                    taxId: parsed.taxId,
                    normalizedTaxId: normalizeTaxId(parsed.taxId),
                    countryCode: null,
                    foreignIdentifier: null,
                    status: parsedStatus,
                    updatedById: common.userId,
                  }
                : {
                    customerType: parsed.customerType,
                    name: parsed.name,
                    taxId: null,
                    normalizedTaxId: null,
                    countryCode: parsed.countryCode,
                    foreignIdentifier: parsed.foreignIdentifier,
                    status: parsedStatus,
                    updatedById: common.userId,
                  },
          });
          await writeAudit(tx, {
            ...auditContext(input),
            entityType: "customer",
            entityId: updated.id,
            operation:
              existing.status !== updated.status
                ? `customer.${updated.status === "ACTIVE" ? "activated" : "deactivated"}`
                : "customer.updated",
            beforeJson: customerSnapshot(existing),
            afterJson: customerSnapshot(updated),
          });
          return {
            value: { id: updated.id },
            responseStatus: 200,
            responseMetadata: { id: updated.id },
            resultReference: updated.id,
          };
        },
      ),
    );
  } catch (error) {
    if (isConstraintError(error)) throw new CustomerConstraintError();
    throw error;
  }
}

export async function assignCustomerCompany(
  db: PrismaClient,
  input: {
    context: RequestContext;
    companyId: string;
    customerId: string;
    relation: CustomerCompanyInput;
    idempotencyKey: string;
    now?: Date;
  },
): Promise<CustomerWriteResult> {
  await requireCustomerAccess(db, input.context, input.companyId, "write");
  const parsed = customerCompanyInputSchema.parse(input.relation);
  const common = writeInput(input);

  try {
    return replayResult(
      await executeIdempotent(
        db,
        {
          companyId: input.companyId,
          userId: common.userId,
          operation: "customer.company.assign",
          key: input.idempotencyKey,
          payload: { customerId: input.customerId, relation: parsed },
          expiresAt: common.expiresAt,
          now: common.now,
        },
        async (tx) => {
          const customer = await tx.customer.findUnique({
            where: { id: input.customerId },
          });
          if (!customer) throw new CustomerNotFoundError();
          const existing = await tx.customerCompany.findUnique({
            where: {
              customerId_companyId: {
                customerId: customer.id,
                companyId: input.companyId,
              },
            },
          });
          const relation = existing
            ? await tx.customerCompany.update({
                where: { id: existing.id },
                data: {
                  customerCode: parsed.customerCode,
                  normalizedCustomerCode: normalizeCode(parsed.customerCode),
                  status: parsed.status,
                  updatedById: common.userId,
                },
              })
            : await tx.customerCompany.create({
                data: {
                  customerId: customer.id,
                  companyId: input.companyId,
                  customerCode: parsed.customerCode,
                  normalizedCustomerCode: normalizeCode(parsed.customerCode),
                  status: parsed.status,
                  createdById: common.userId,
                  updatedById: common.userId,
                },
              });
          await writeAudit(tx, {
            ...auditContext(input),
            entityType: "customer_company",
            entityId: relation.id,
            operation: existing
              ? "customer_company.updated"
              : "customer_company.created",
            beforeJson: existing
              ? customerCompanySnapshot(existing)
              : undefined,
            afterJson: customerCompanySnapshot(relation),
          });
          return {
            value: { id: relation.id },
            responseStatus: existing ? 200 : 201,
            responseMetadata: { id: relation.id },
            resultReference: relation.id,
          };
        },
      ),
    );
  } catch (error) {
    if (isConstraintError(error)) {
      throw new CustomerConstraintError("公司客戶代碼已被使用");
    }
    throw error;
  }
}

async function clearOtherPrimaryContacts(
  tx: Prisma.TransactionClient,
  input: {
    customerId: string;
    exceptId?: string;
    actorUserId: string;
    context: RequestContext;
    companyId: string;
  },
) {
  const previous = await tx.customerContact.findMany({
    where: {
      customerId: input.customerId,
      status: "ACTIVE",
      isPrimary: true,
      ...(input.exceptId ? { id: { not: input.exceptId } } : {}),
    },
  });
  for (const contact of previous) {
    const updated = await tx.customerContact.update({
      where: { id: contact.id },
      data: { isPrimary: false, updatedById: input.actorUserId },
    });
    await writeAudit(tx, {
      ...auditContext(input),
      entityType: "customer_contact",
      entityId: updated.id,
      operation: "customer_contact.primary_unset",
      beforeJson: contactSnapshot(contact),
      afterJson: contactSnapshot(updated),
    });
  }
}

export async function saveCustomerContact(
  db: PrismaClient,
  input: {
    context: RequestContext;
    companyId: string;
    customerId: string;
    contactId?: string;
    contact: CustomerContactInput;
    idempotencyKey: string;
    now?: Date;
  },
): Promise<CustomerWriteResult> {
  await requireCustomerAccess(db, input.context, input.companyId, "write");
  const parsed = customerContactInputSchema.parse(input.contact);
  const common = writeInput(input);
  const isPrimary = parsed.status === "ACTIVE" && parsed.isPrimary;

  try {
    return replayResult(
      await executeIdempotent(
        db,
        {
          companyId: input.companyId,
          userId: common.userId,
          operation: input.contactId
            ? "customer.contact.update"
            : "customer.contact.create",
          key: input.idempotencyKey,
          payload: {
            customerId: input.customerId,
            contactId: input.contactId,
            contact: parsed,
          },
          expiresAt: common.expiresAt,
          now: common.now,
        },
        async (tx) => {
          await requireActiveCustomerRelation(
            tx,
            input.customerId,
            input.companyId,
          );
          const existing = input.contactId
            ? await tx.customerContact.findFirst({
                where: {
                  id: input.contactId,
                  customerId: input.customerId,
                },
              })
            : null;
          if (input.contactId && !existing) {
            throw new CustomerChildNotFoundError("聯絡人");
          }
          if (isPrimary) {
            await clearOtherPrimaryContacts(tx, {
              customerId: input.customerId,
              exceptId: existing?.id,
              actorUserId: common.userId,
              context: input.context,
              companyId: input.companyId,
            });
          }
          const data = {
            name: parsed.name,
            department: parsed.department,
            jobTitle: parsed.jobTitle,
            phone: parsed.phone,
            mobile: parsed.mobile,
            email: parsed.email?.toLowerCase() ?? null,
            notes: parsed.notes,
            isPrimary,
            status: parsed.status,
            updatedById: common.userId,
          };
          const contact = existing
            ? await tx.customerContact.update({
                where: { id: existing.id },
                data,
              })
            : await tx.customerContact.create({
                data: {
                  customerId: input.customerId,
                  ...data,
                  createdById: common.userId,
                },
              });
          await writeAudit(tx, {
            ...auditContext(input),
            entityType: "customer_contact",
            entityId: contact.id,
            operation: existing
              ? "customer_contact.updated"
              : "customer_contact.created",
            beforeJson: existing ? contactSnapshot(existing) : undefined,
            afterJson: contactSnapshot(contact),
          });
          return {
            value: { id: contact.id },
            responseStatus: existing ? 200 : 201,
            responseMetadata: { id: contact.id },
            resultReference: contact.id,
          };
        },
      ),
    );
  } catch (error) {
    if (isConstraintError(error)) throw new CustomerConstraintError();
    throw error;
  }
}

async function clearOtherDefaultLocations(
  tx: Prisma.TransactionClient,
  input: {
    customerId: string;
    exceptId?: string;
    actorUserId: string;
    context: RequestContext;
    companyId: string;
  },
) {
  const previous = await tx.deliveryLocation.findMany({
    where: {
      customerId: input.customerId,
      status: "ACTIVE",
      isDefault: true,
      ...(input.exceptId ? { id: { not: input.exceptId } } : {}),
    },
  });
  for (const location of previous) {
    const updated = await tx.deliveryLocation.update({
      where: { id: location.id },
      data: { isDefault: false, updatedById: input.actorUserId },
    });
    await writeAudit(tx, {
      ...auditContext(input),
      entityType: "delivery_location",
      entityId: updated.id,
      operation: "delivery_location.default_unset",
      beforeJson: locationSnapshot(location),
      afterJson: locationSnapshot(updated),
    });
  }
}

export async function saveDeliveryLocation(
  db: PrismaClient,
  input: {
    context: RequestContext;
    companyId: string;
    customerId: string;
    locationId?: string;
    location: DeliveryLocationInput;
    idempotencyKey: string;
    now?: Date;
  },
): Promise<CustomerWriteResult> {
  await requireCustomerAccess(db, input.context, input.companyId, "write");
  const parsed = deliveryLocationInputSchema.parse(input.location);
  const common = writeInput(input);
  const isDefault = parsed.status === "ACTIVE" && parsed.isDefault;

  try {
    return replayResult(
      await executeIdempotent(
        db,
        {
          companyId: input.companyId,
          userId: common.userId,
          operation: input.locationId
            ? "customer.location.update"
            : "customer.location.create",
          key: input.idempotencyKey,
          payload: {
            customerId: input.customerId,
            locationId: input.locationId,
            location: parsed,
          },
          expiresAt: common.expiresAt,
          now: common.now,
        },
        async (tx) => {
          await requireActiveCustomerRelation(
            tx,
            input.customerId,
            input.companyId,
          );
          const existing = input.locationId
            ? await tx.deliveryLocation.findFirst({
                where: {
                  id: input.locationId,
                  customerId: input.customerId,
                },
              })
            : null;
          if (input.locationId && !existing) {
            throw new CustomerChildNotFoundError("送貨地點");
          }
          if (isDefault) {
            await clearOtherDefaultLocations(tx, {
              customerId: input.customerId,
              exceptId: existing?.id,
              actorUserId: common.userId,
              context: input.context,
              companyId: input.companyId,
            });
          }
          const data = {
            code: parsed.code,
            name: parsed.name,
            recipientName: parsed.recipientName,
            phone: parsed.phone,
            postalCode: parsed.postalCode,
            city: parsed.city,
            district: parsed.district,
            addressLine: parsed.addressLine,
            fullAddress: buildFullAddress(parsed),
            notes: parsed.notes,
            isDefault,
            status: parsed.status,
            updatedById: common.userId,
          };
          const location = existing
            ? await tx.deliveryLocation.update({
                where: { id: existing.id },
                data,
              })
            : await tx.deliveryLocation.create({
                data: {
                  customerId: input.customerId,
                  ...data,
                  createdById: common.userId,
                },
              });
          await writeAudit(tx, {
            ...auditContext(input),
            entityType: "delivery_location",
            entityId: location.id,
            operation: existing
              ? "delivery_location.updated"
              : "delivery_location.created",
            beforeJson: existing ? locationSnapshot(existing) : undefined,
            afterJson: locationSnapshot(location),
          });
          return {
            value: { id: location.id },
            responseStatus: existing ? 200 : 201,
            responseMetadata: { id: location.id },
            resultReference: location.id,
          };
        },
      ),
    );
  } catch (error) {
    if (isConstraintError(error)) {
      throw new CustomerConstraintError("送貨地點代碼已被使用");
    }
    throw error;
  }
}
