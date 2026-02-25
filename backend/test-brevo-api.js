// test-brevo-api.js
require('dotenv').config();

async function run() {
    console.log('Testing Brevo API via standard HTTPS (Port 443)...');

    const apiKey = process.env.EMAIL_PASS;

    if (!apiKey) {
        console.error('Missing EMAIL_PASS in environment variables');
        process.exit(1);
    }

    const payload = {
        sender: {
            name: "Club Hub Test",
            email: process.env.EMAIL_USER
        },
        to: [
            {
                email: process.env.EMAIL_USER,
                name: "Test User"
            }
        ],
        subject: "Brevo API Unit Test",
        htmlContent: "<html><body><h1>This is a test from the Brevo HTTP API!</h1><p>If you get this, the HTTP API works perfectly.</p></body></html>"
    };

    try {
        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'api-key': apiKey
            },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            const data = await response.json();
            console.log('✅ Success! Brevo API accepted the email:', data);
        } else {
            const errorText = await response.text();
            console.error('❌ Failed! HTTP Status:', response.status);
            console.error('Response:', errorText);
        }
    } catch (err) {
        console.error('❌ Network error:', err.message);
    }
}

run();
