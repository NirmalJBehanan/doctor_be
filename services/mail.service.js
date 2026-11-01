import { BrevoClient } from '@getbrevo/brevo';
import dotenv from "dotenv";

dotenv.config();
const brevo = new BrevoClient({
  apiKey: process.env.brevo_api_key,
});

export const sendRegistrationEmail = async (email, name,activationToken) => {
    const result = await brevo.transactionalEmails.sendTransacEmail({
        subject: "Registration Successful click the link to verify",
        sender: {
            name: process.env.brevo_sender_name,
            email: process.env.brevo_sender_email,
        },
        to: [
            {
                email: email,
            },
        ],
        htmlContent: `Hello ${name}, your registration was successful!.
        click the link to activayte the account:
        "http://localhost:5173/activate/${activationToken}"
        
        `
    });

    return result;
};

