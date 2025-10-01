export const API_URL = import.meta.env.VITE_API_URL;

export async function fetchOrderStatus(orderId: string) {
  const res = await fetch(`${API_URL}/order-status/${orderId}`);
  return res.json();
}
