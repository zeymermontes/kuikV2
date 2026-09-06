import Foundation
import Network
import Capacitor

/// Writes ESC/POS bytes to a network printer (port 9100 by convention) and
/// closes. The tablet talks to the printer on the restaurant's Wi-Fi, so no
/// print agent is needed for network printers. The first connection prompts
/// for Local Network access (NSLocalNetworkUsageDescription in Info.plist).
@objc(KuikPrinterPlugin)
public class KuikPrinterPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "KuikPrinterPlugin"
    public let jsName = "KuikPrinter"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "sendTcp", returnType: CAPPluginReturnPromise)
    ]

    private let queue = DispatchQueue(label: "mx.kuik.printer")

    @objc func sendTcp(_ call: CAPPluginCall) {
        guard let host = call.getString("host"), !host.isEmpty,
              let port = call.getInt("port"), port > 0, port <= 65535,
              let b64 = call.getString("data"), let data = Data(base64Encoded: b64) else {
            call.reject("host, port and data are required")
            return
        }
        let timeout = Double(call.getInt("timeoutMs") ?? 8000) / 1000.0
        guard let nwPort = NWEndpoint.Port(rawValue: UInt16(port)) else {
            call.reject("bad port")
            return
        }

        let params = NWParameters.tcp
        params.allowLocalEndpointReuse = true
        let conn = NWConnection(host: NWEndpoint.Host(host), port: nwPort, using: params)
        var finished = false
        let finish: (String?) -> Void = { error in
            self.queue.async {
                if finished { return }
                finished = true
                conn.cancel()
                if let error = error { call.reject(error) } else { call.resolve() }
            }
        }

        conn.stateUpdateHandler = { state in
            switch state {
            case .ready:
                conn.send(content: data, completion: .contentProcessed { err in
                    if let err = err {
                        finish("write to \(host):\(port): \(err.localizedDescription)")
                        return
                    }
                    // Give the printer a moment to drain before the socket
                    // closes under it; cheap models drop the tail otherwise.
                    self.queue.asyncAfter(deadline: .now() + 0.15) { finish(nil) }
                })
            case .failed(let err):
                finish("cannot reach \(host):\(port): \(err.localizedDescription)")
            case .waiting(let err):
                finish("cannot reach \(host):\(port): \(err.localizedDescription)")
            case .cancelled:
                finish("connection cancelled")
            default:
                break
            }
        }
        conn.start(queue: queue)
        queue.asyncAfter(deadline: .now() + timeout) { finish("timeout reaching \(host):\(port)") }
    }
}
