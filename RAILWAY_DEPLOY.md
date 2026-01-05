# Deploying to Railway

This guide explains how to deploy the AI Glasses Backend to [Railway.com](https://railway.app/).

## Prerequisites

- A Railway account.
- Your Wasabi (or S3) credentials.

## Steps

1.  **Create a New Project on Railway**

    - Go to your Railway dashboard.
    - Click "New Project" > "Deploy from GitHub repo" (if you pushed this code) OR use the Railway CLI.

2.  **Configure Environment Variables**

    - In your Railway project, go to the **Variables** tab.
    - Add the following variables:

    | Variable Name           | Description                           | Example Value                |
    | :---------------------- | :------------------------------------ | :--------------------------- |
    | `AWS_ACCESS_KEY_ID`     | **(Required)** Your Wasabi Access Key | `CIRUIT...`                  |
    | `AWS_SECRET_ACCESS_KEY` | **(Required)** Your Wasabi Secret Key | `q7yM...`                    |
    | `AWS_ENDPOINT`          | (Optional) S3 Endpoint                | `s3.eu-west-1.wasabisys.com` |
    | `AWS_REGION`            | (Optional) Region                     | `eu-west-1`                  |
    | `S3_BUCKET`             | (Optional) Bucket name                | `jigu`                       |
    | `REQUIRE_AUTH`          | (Optional) Enable auth                | `true` or `false`            |
    | `AUTH_SECRET`           | (Required if auth enabled)            | `your-secret-key`            |

3.  **Deploy**

    - Railway should automatically detect the `Dockerfile` and build the application.
    - Once deployed, you will get a public URL (e.g., `https://web-production-xxxx.up.railway.app`).

4.  **Verify**
    - Visit the health check endpoint: `https://<your-url>/health`
    - It should return `{"status": "healthy", ...}`.

## Notes

- The application listens on port `5000` inside the container. Railway automatically maps this to the public port (usually 80/443).
- The `Dockerfile` installs both Node.js and Python dependencies as required for the AI matching logic.
