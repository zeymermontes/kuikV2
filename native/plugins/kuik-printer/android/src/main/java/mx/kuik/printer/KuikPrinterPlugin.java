package mx.kuik.printer;

import android.util.Base64;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;

/**
 * Writes ESC/POS bytes to a network printer (port 9100 by convention) and
 * closes. The tablet talks to the printer on the restaurant's Wi-Fi, so no
 * print agent is needed for network printers.
 */
@CapacitorPlugin(name = "KuikPrinter")
public class KuikPrinterPlugin extends Plugin {

    @PluginMethod
    public void sendTcp(PluginCall call) {
        String host = call.getString("host", "");
        Integer port = call.getInt("port", 0);
        String b64 = call.getString("data", "");
        int timeout = call.getInt("timeoutMs", 8000);
        if (host == null || host.isEmpty() || port == null || port <= 0 || port > 65535 || b64 == null || b64.isEmpty()) {
            call.reject("host, port and data are required");
            return;
        }
        final byte[] data;
        try {
            data = Base64.decode(b64, Base64.DEFAULT);
        } catch (IllegalArgumentException e) {
            call.reject("data is not base64");
            return;
        }
        final int p = port;
        new Thread(() -> {
            try (Socket socket = new Socket()) {
                socket.connect(new InetSocketAddress(host, p), timeout);
                socket.setSoTimeout(timeout);
                OutputStream out = socket.getOutputStream();
                out.write(data);
                out.flush();
                // Give the printer a moment to drain before the socket closes
                // under it; cheap models drop the tail otherwise.
                Thread.sleep(150);
                call.resolve();
            } catch (Exception e) {
                call.reject("cannot reach " + host + ":" + p + ": " + e.getMessage());
            }
        }, "kuik-printer").start();
    }
}
