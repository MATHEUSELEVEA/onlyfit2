# OnlyFit Mobile — checklist de publicação iOS

Este repo (`onlyfit-mobile`) é a fonte do app iOS nativo para TestFlight/App Store.

## Identidade do app

- Bundle ID: `com.onlyfitapp`
- Apple Developer Team ID: `57U869P75F`
- Domínio primário de links do app: `mobile.onlyfitapp.com`

## Capabilities obrigatórias no Apple Developer

Habilitar no App Identifier `com.onlyfitapp`:

- Associated Domains
- HealthKit
- HealthKit Background Delivery

Após habilitar, regenerar/atualizar o provisioning profile usado no Xcode/CI.

## Associated Domains

O entitlement do app inclui:

- `applinks:mobile.onlyfitapp.com`
- `applinks:onlyfitapp.com`
- `applinks:www.onlyfitapp.com`

O domínio que hospeda o app precisa servir o arquivo:

- `/.well-known/apple-app-site-association`

Sem redirect e com `Content-Type: application/json` ou `application/pkcs7-mime`.

## Fluxos críticos para testar no TestFlight

1. Cadastro novo
   - criar conta no app;
   - receber e-mail;
   - tocar em “Confirmar e-mail”;
   - app deve abrir em `/auth/confirm`;
   - sessão deve ficar válida depois do login.

2. Recuperação de senha
   - solicitar reset no app;
   - tocar no e-mail;
   - app deve abrir em `/reset-password`;
   - trocar senha;
   - login com nova senha.

3. Apple Health
   - abrir My Fit;
   - conectar Apple Health;
   - iOS deve mostrar prompt real de permissões;
   - sincronização deve enviar dados para `wearables-ingest`;
   - nenhum texto de mock/simulação deve aparecer em produção.

## Validações locais

```bash
npm run lint
npm run build
npm run build:ios
```

## Validação obrigatória em Mac/Xcode

Esta etapa não roda em Linux:

```bash
xcodebuild \
  -workspace ios/App/App.xcworkspace \
  -scheme App \
  -configuration Release \
  -destination generic/platform=iOS \
  archive
```

Se falhar no archive/TestFlight, verificar primeiro:

- signing team;
- provisioning profile atualizado;
- capabilities do App Identifier;
- versão/build number;
- App Store Connect com Bundle ID `com.onlyfitapp`.
