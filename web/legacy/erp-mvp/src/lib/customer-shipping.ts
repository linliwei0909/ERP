export type CustomerShippingSource = {
  address: string | null;
};

export type AlternativeShippingAddress = {
  id: number;
  address: string;
  shippingFeeMarkup: { toString(): string } | string | number;
};

/**
 * Central shipping rule for future order entry:
 * no alternative address selected means the customer's own address with no markup.
 */
export function resolveCustomerShipping(
  customer: CustomerShippingSource,
  selectedAddress: AlternativeShippingAddress | null,
) {
  if (!selectedAddress) {
    return {
      address: customer.address,
      shippingAddressId: null,
      shippingFeeMarkup: "0",
    };
  }

  return {
    address: selectedAddress.address,
    shippingAddressId: selectedAddress.id,
    shippingFeeMarkup: selectedAddress.shippingFeeMarkup.toString(),
  };
}
