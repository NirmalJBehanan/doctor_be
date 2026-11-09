import { BrevoClient } from "@getbrevo/brevo";
import dotenv from "dotenv";

dotenv.config();

const brevo = new BrevoClient({
    apiKey: process.env.brevo_api_key,
});


// Registration email
export const sendRegistrationEmail = async (email, name, activationToken) => {

    const result = await brevo.transactionalEmails.sendTransacEmail({
        subject: "Registration Successful - Verify Your Account",

        sender: {
            name: process.env.brevo_sender_name,
            email: process.env.brevo_sender_email,
        },

        to: [
            {
                email: email,
            },
        ],

        htmlContent: `
            <h2>Hello ${name},</h2>

            <p>Your registration was successful!</p>

            <p>Click the link below to activate your account:</p>

            <a href="${process.env.FRONTEND_URL}/activate/${activationToken}">
                Activate Account
            </a>

            <p>Thank you.</p>
        `
    });

    return result;
};


// Doctor credentials email
export const sendDoctorCredentialsEmail = async (email, name, password) => {

    const result = await brevo.transactionalEmails.sendTransacEmail({
        subject: "Your Doctor Account Has Been Created",

        sender: {
            name: process.env.brevo_sender_name,
            email: process.env.brevo_sender_email,
        },

        to: [
            {
                email: email,
            },
        ],

        htmlContent: `
            <h2>Hello Dr. ${name},</h2>

            <p>Your doctor account has been created successfully by the admin.</p>

            <h3>Your Login Credentials</h3>

            <p><strong>Email:</strong> ${email}</p>

            <p><strong>Password:</strong> ${password}</p>

            <p>You can now log in to your doctor account.</p>

            <p>After logging in, please create your professional doctor profile.</p>

            <p>Thank you.</p>
        `
    });

    return result;
};