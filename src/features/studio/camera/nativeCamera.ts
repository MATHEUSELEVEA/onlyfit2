import { Capacitor } from '@capacitor/core';

// A câmera nativa (camera-preview → AVFoundation em Swift) só existe no app
// instalado. No navegador — e em qualquer plataforma sem o plugin registrado —
// caímos no caminho web (getUserMedia). Checar as duas coisas evita quebrar o
// build web e degrada com elegância.
export function isNativeCamera(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('CameraPreview');
}
