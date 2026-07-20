import Capacitor
import UIKit

/// Bridge view controller do OnlyFit.
///
/// Plugins nativos que moram no target do app (e não em um pacote npm) NÃO entram
/// no `packageClassList` do `capacitor.config.json` — o `npx cap sync` regenera essa
/// lista apenas a partir dos plugins em `node_modules`. Por isso registramos os plugins
/// locais aqui, no `capacitorDidLoad()`, que é o ponto oficial e sobrevive ao sync.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(OnlyFitHealthKitPlugin())
        bridge?.registerPluginInstance(OnlyFitSecureStoragePlugin())
    }
}
