// Descobre a lente ultra-angular (0,5×) traseira, a "mais ampla" do iPhone.
//
// O iOS costuma abstrair as 3 lentes traseiras numa única "Back Camera", mas a
// partir do iOS 16.4+ o WebKit passou a expor a ultra-angular como um device
// próprio em enumerateDevices(). Isso só funciona DEPOIS de a permissão de
// câmera ter sido concedida — antes disso os labels vêm vazios. Onde o WebView
// não expõe (aparelho/versão sem suporte), retorna null e o toggle 0,5× some.
export async function findUltraWideCameraId(): Promise<string | null> {
  if (!navigator.mediaDevices?.enumerateDevices) return null;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    // O label da ultra-angular contém "ultra" em toda localização conhecida do
    // iOS ("Back Ultra Wide Camera", "Câmera ultra-angular traseira", …).
    const ultra = devices.find(
      (device) => device.kind === 'videoinput' && /ultra/i.test(device.label),
    );
    return ultra?.deviceId ?? null;
  } catch {
    return null;
  }
}
