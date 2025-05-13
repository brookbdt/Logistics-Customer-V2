import { prisma } from '$lib/utils/prisma';
import { randomBytes } from 'crypto';


/**
 * Constants for payment integration
 */
const CHAPA_TEST_API_KEY = 'CHASECK_TEST-XnClzXRLcCLdg7cpBpuVMhPPgeTd7xNo';

/**
 * Initialize Chapa payment for draft or completed orders
 */
export async function initializeChapa(
    orderDetail: any,
    userDetails: {
        email: string;
        firstName: string;
        lastName: string;
        phoneNumber: string;
    },
    options: {
        webappUrl: string;
        isDraft?: boolean;
    }
) {
    const tx_ref = randomBytes(10).toString("hex");

    // Format phone number for Ethiopian format
    const regex = /(^0)|(\d+)/g;
    const validPhoneNumber = userDetails.phoneNumber.replace(
        regex,
        (match: string) => {
            if (match[0] === "0") return "";
            return "251" + match;
        }
    );

    // Prepare different callback URLs based on order type
    let orderCallbackUrl;
    let orderReturnUrl;

    if (options.isDraft) {
        // For draft orders, redirect to completion with payment success
        orderCallbackUrl = `${options.webappUrl}/payment-complete/${orderDetail.id}`;
        orderReturnUrl = `${options.webappUrl}/payment-complete/${orderDetail.id}`;
    } else {
        // For existing orders, return to order detail
        orderCallbackUrl = `${options.webappUrl}/order-detail/${orderDetail.id}`;
        orderReturnUrl = `${options.webappUrl}/order-detail/${orderDetail.id}`;
    }

    try {
        const response = await fetch(
            "https://api.chapa.co/v1/transaction/initialize",
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${CHAPA_TEST_API_KEY}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    amount: orderDetail?.totalCost?.toString() || "0",
                    currency: "ETB",
                    email: userDetails.email,
                    first_name: userDetails.firstName,
                    last_name: userDetails.lastName,
                    phone_number: validPhoneNumber,
                    tx_ref: tx_ref,
                    callback_url: orderCallbackUrl,
                    return_url: orderReturnUrl,
                    "customization[title]": `Payment for Order #${orderDetail.id}`,
                    "customization[description]": `Package from ${options.isDraft ? 'You' : orderDetail?.Sender?.User?.userName || 'Sender'} to ${orderDetail?.receiverName || 'Receiver'}`,
                }),
            }
        );

        const data = await response.json();

        if (data.status === "success") {
            // Update order with payment reference
            await prisma.order.update({
                where: { id: orderDetail.id },
                data: {
                    paymentRef: tx_ref,
                    paymentMethod: "CHAPA",
                    paymentDate: new Date(),
                    paymentAmount: orderDetail.totalCost || 0,
                    orderStatus: options.isDraft ? "PENDING_PAYMENT" : orderDetail.orderStatus,
                },
            });

            return { success: true, checkoutUrl: data.data.checkout_url, tx_ref };
        } else {
            throw new Error(data.message || "Failed to initialize payment");
        }
    } catch (error) {
        console.error("Error initializing Chapa payment:", error);
        throw error;
    }
}

/**
 * Verify a Chapa payment using the transaction reference
 */
export async function verifyChapa(paymentRef: string) {
    try {
        const verifyPaymentResponse = await fetch(
            `https://api.chapa.co/v1/transaction/verify/${paymentRef}`,
            {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${CHAPA_TEST_API_KEY}`,
                    "Content-Type": "application/json",
                },
            }
        );

        const paymentData = await verifyPaymentResponse.json();

        if (paymentData.status === "success") {
            return {
                success: true,
                data: paymentData.data
            };
        } else {
            return {
                success: false,
                message: paymentData.message || "Payment verification failed"
            };
        }
    } catch (error) {
        console.error("Error verifying payment:", error);
        return {
            success: false,
            message: "Error verifying payment"
        };
    }
} 