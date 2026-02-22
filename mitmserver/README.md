# Open Antigravity - MITM Server

This is a man-in-the-middle (MITM) proxy server designed to intercept and inspect the network requests made by the official Antigravity application. It's a crucial tool for understanding the Antigravity API and for developing the Open Antigravity gateway.

## How it Works

The server is a simple Node.js application that uses the `http-proxy` library. It creates a proxy server that listens on a local port. When the Antigravity application is configured to use this proxy, all of its network traffic will pass through this server. The server logs the details of each request and response to the console, allowing you to see exactly what's happening under the hood.

## Installation

1.  Navigate to this directory:
    ```bash
    cd mitmserver
    ```

2.  Install the dependencies:
    ```bash
    npm install
    ```

## Running the Server

1.  Start the server:
    ```bash
    npm start
    ```
    By default, the server listens on `127.0.0.1:8080` and forwards traffic to `http://localhost:3000`.

2.  (Optional) Configure runtime settings with environment variables:
    - `TARGET_URL` (default: `http://localhost:3000`)
    - `HOST` (default: `127.0.0.1`)
    - `PORT` (default: `8080`)

    PowerShell example:
    ```powershell
    $env:TARGET_URL = "https://real.antigravity.backend.com"
    $env:HOST = "127.0.0.1"
    $env:PORT = "8080"
    npm start
    ```

## Configuring the Antigravity App

To use this proxy, you need to configure the official Antigravity application to send its requests to the proxy server instead of the real Antigravity backend. The exact method for this will depend on the Antigravity application itself. You may need to:

-   Change a setting in the application's configuration file.
-   Use a tool that intercepts system-wide network traffic and redirects it to the proxy.

### System-Wide Proxy Configuration (Windows)

If you cannot directly configure the Antigravity application to use a proxy, you can try setting up a system-wide proxy on Windows. This will route all HTTP/HTTPS traffic through your MITM server.

1.  **Open Proxy Settings:**
    *   Go to `Settings` > `Network & Internet` > `Proxy`.
    *   Alternatively, search for "Proxy settings" in the Windows search bar.

2.  **Manual Proxy Setup:**
    *   Under the "Manual proxy setup" section, toggle "Use a proxy server" to `On`.
    *   Set "Proxy IP address" to `127.0.0.1` (or `localhost`).
    *   Set "Port" to `8080` (or whatever port your MITM server is listening on).
    *   Check "Don't use the proxy server for local (intranet) addresses" if you only want to proxy external traffic.
    *   Click `Save`.

3.  **Verify:**
    *   Start your MITM server (`npm start` in the `mitmserver` directory).
    *   Launch the official Antigravity application.
    *   You should now see requests and responses being logged in your MITM server's console.

**Note:** Remember to disable the system-wide proxy settings when you are done testing, as it will affect all your internet traffic.

**Important:** Set `TARGET_URL` to the real Antigravity backend before using this proxy with the official app.

Once configured, you will see requests and responses logged in the console. Sensitive headers such as `Authorization` and `Cookie` are redacted.
