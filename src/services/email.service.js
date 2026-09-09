const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

// Low-level sender 

const sendEmail = async ({ to, subject, html }) => {
    try{
        const { data, error} = await resend.emails.send({
            from: process.env.EMAIL_FROM,
            to,
            subject,
            html,
        });

        if (error) {
            console.error('Resend error:', error);
            return null;
        }

        return data;

    } catch (error) {
        console.error('Failed to send email:', error.message);
        return null;
    }
};

// Sent right after a user registers

const sendWelcomeEmail = async (user) => {
    return sendEmail({
        to: user.email,
        subject: 'Welcome to the marketplace!',
        html: `
            <h1>Hi ${user.name}</h1>
            <p>Thanks for joining! your account has been created successfully.</p>
        `,
    });
};

// Sent from the Stripe webhook once a payment is confirmed

const sendOrderConfirmationEmail = async (order, user) => {
    const itemsHtml = order.items
    .map((item) => `<li>${item.quantity} x ${item.name} - $${item.price.toFixed(2)}</li>`)
    .join('');

    return sendEmail({
        to: user.email,
        subject: `Order confirmed - ${order.orderNumber}`,
        html: `
            <h1>Thanks for your order, ${user.name}!</h1>
            <p>Order <strong>${order.orderNumber}</strong> has been confirmed</p>
            <ul>${itemsHtml}</ul>
            <p><strong>Total: $${order.total.toFixed(2)}</strong></p>
        `,
    });
};

module.exports = {
    sendEmail,
    sendWelcomeEmail,
    sendOrderConfirmationEmail,
};
