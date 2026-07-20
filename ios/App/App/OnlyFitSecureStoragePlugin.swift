import Capacitor
import Foundation
import Security

@objc(OnlyFitSecureStoragePlugin)
public class OnlyFitSecureStoragePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "OnlyFitSecureStoragePlugin"
    public let jsName = "OnlyFitSecureStorage"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise)
    ]

    private let service = "app.onlyfit.mobile.secure-storage"

    @objc public func get(_ call: CAPPluginCall) {
        guard let key = call.getString("key"), !key.isEmpty else {
            call.reject("Chave inválida.")
            return
        }

        var query = baseQuery(for: key)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecItemNotFound {
            call.resolve(["value": NSNull()])
            return
        }
        guard status == errSecSuccess else {
            call.reject("Falha ao ler Keychain: \(status)")
            return
        }
        guard let data = item as? Data, let value = String(data: data, encoding: .utf8) else {
            call.resolve(["value": NSNull()])
            return
        }
        call.resolve(["value": value])
    }

    @objc public func set(_ call: CAPPluginCall) {
        guard let key = call.getString("key"), !key.isEmpty else {
            call.reject("Chave inválida.")
            return
        }
        guard let value = call.getString("value") else {
            call.reject("Valor inválido.")
            return
        }
        guard let data = value.data(using: .utf8) else {
            call.reject("Valor não codificável.")
            return
        }

        SecItemDelete(baseQuery(for: key) as CFDictionary)

        var attributes = baseQuery(for: key)
        attributes[kSecValueData as String] = data
        attributes[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly

        let status = SecItemAdd(attributes as CFDictionary, nil)
        guard status == errSecSuccess else {
            call.reject("Falha ao salvar Keychain: \(status)")
            return
        }
        call.resolve()
    }

    @objc public func remove(_ call: CAPPluginCall) {
        guard let key = call.getString("key"), !key.isEmpty else {
            call.reject("Chave inválida.")
            return
        }

        let status = SecItemDelete(baseQuery(for: key) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            call.reject("Falha ao remover Keychain: \(status)")
            return
        }
        call.resolve()
    }

    private func baseQuery(for key: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key
        ]
    }
}
