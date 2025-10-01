
// Define the structure for a mock order status
interface MockOrderStatus {
    status: 'Processing' | 'Shipped' | 'Delivered' | 'Cancelled';
    trackingNumber: string;
    deliveryDate: string;
}

/**
 * Simulates a lookup to a dedicated Order Status API based on the Order ID.
 * This is a mock function and uses the Order ID to deterministically generate a status.
 * * @param orderId The extracted Order ID from the user's query.
 * @returns A conversational status message.
 */
export function getOrderStatus(orderId: string): string {
    const defaultOrder: MockOrderStatus = {
        status: 'Processing',
        trackingNumber: 'N/A',
        deliveryDate: 'Unknown'
    };

    // Use a simple hash of the order ID to make the mock status deterministic
    let hash = 0;
    for (let i = 0; i < orderId.length; i++) {
        hash = orderId.charCodeAt(i) + ((hash << 5) - hash);
    }

    let statusData: MockOrderStatus;

    if (hash % 3 === 0) {
        // Status 1: Shipped
        statusData = {
            status: 'Shipped',
            trackingNumber: 'TRK' + Math.abs(hash).toString().substring(0, 7),
            deliveryDate: 'October 5th'
        };
    } else if (hash % 3 === 1) {
        // Status 2: Processing
        statusData = defaultOrder;
    } else {
        // Status 3: Delivered
        statusData = {
            status: 'Delivered',
            trackingNumber: 'N/A',
            deliveryDate: 'September 28th'
        };
    }

    const { status, trackingNumber, deliveryDate } = statusData;
    let message = `The status for your order **${orderId.toUpperCase()}** is currently **${status}**.`;

    if (status === 'Shipped') {
        message += ` It is expected to arrive on ${deliveryDate}. Your tracking number is ${trackingNumber}.`;
    } else if (status === 'Delivered') {
        message += ` It was successfully delivered on ${deliveryDate}.`;
    } else if (status === 'Processing') {
        message += ` We are still preparing your item for shipment. We will notify you when it ships.`;
    }

    return message;
}
