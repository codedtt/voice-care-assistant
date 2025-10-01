/**
 * Mock API function to retrieve specific product information.
 * In a real application, this would query a dedicated Product Catalog Database or API.
 * * @param productName The name of the product extracted from the user's query (e.g., "Apex Pro Suite").
 * @returns A string containing the mock product details.
 */
// Define the specific structure of a product item
interface ProductDetails {
    name: string;
    details: string;
    availability: string;
}

// Define the specific structure of the product catalog, mapping literal keys to the ProductDetails structure.
// This is the key to resolving the indexing error.
interface ProductCatalog {
    'pro suite': ProductDetails;
    'basic plan': ProductDetails;
    'monitor x': ProductDetails;
}

export function getProductInfo(productName: string): string {
    const normalizedName = productName.toLowerCase().trim();

    // Mock Product Data Lookup - Typed with ProductCatalog
    const productData: ProductCatalog = {
        'pro suite': {
            name: 'Apex Pro Suite',
            details: "The Apex Pro Suite is our premium offering, featuring real-time data analytics, unlimited cloud storage, and priority 24/7 technical support. It is currently available for purchase with a 15% introductory discount.",
            availability: "In Stock"
        },
        'basic plan': {
            name: 'Apex Basic Plan',
            details: "The Basic Plan provides essential features, including 10GB of cloud storage and community-level support. It's a great starting point for individual users.",
            availability: "Always Available"
        },
        'monitor x': {
            name: 'Monitor X',
            details: "Monitor X is a 32-inch 4K curved display with a 144Hz refresh rate and built-in eye-care technology. Comes with a 2-year warranty.",
            availability: "Low Stock - Next shipment in 3 days."
        }
    };

    // Get the keys and assert their type to inform TypeScript that they are safe to use for indexing.
    const productKeys = Object.keys(productData) as (keyof ProductCatalog)[];

    const productKey = productKeys.find(key => normalizedName.includes(key) || key.includes(normalizedName));

    if (productKey) {
        // TypeScript now knows 'productKey' is a valid key for 'productData'.
        const product = productData[productKey];
        return `${product.name} details: ${product.details} Current Availability: ${product.availability}`;
    } else {
        return `I'm sorry, I couldn't find specific details for a product named "${productName}". Could you please check the spelling or ask about 'Pro Suite', 'Basic Plan', or 'Monitor X'?`;
    }
}
