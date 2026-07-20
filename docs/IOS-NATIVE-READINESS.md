# IOS-NATIVE-READINESS.md

Checklist obrigatório para considerar o OnlyFit pronto como app iOS nativo.

## Build nativo

- Bundle ID: `app.onlyfit.mobile`.
- Plataforma-alvo: iPhone (`TARGETED_DEVICE_FAMILY = 1`).
- Deployment target: iOS 15+.
- App icon: `ios/App/App/Assets.xcassets/AppIcon.appiconset`.
- Splash: `ios/App/App/Assets.xcassets/Splash.imageset`.
- Build web sincronizado no projeto nativo com `npm run build:ios`.

## HealthKit real

HealthKit não funciona em navegador, PWA, preview Vercel, simulador sem dados reais ou build web. O fluxo real exige:

1. Abrir `ios/App/App.xcodeproj` no Xcode.
2. Selecionar o target `App`.
3. Em Signing & Capabilities, usar uma conta Apple Developer do time correto.
4. Confirmar que o App ID `app.onlyfit.mobile` tem HealthKit ativo no Apple Developer Portal.
5. Confirmar estes entitlements no app assinado:
   - `com.apple.developer.healthkit`
   - `com.apple.developer.healthkit.background-delivery`
6. Rodar em iPhone físico com Apple Health contendo dados reais.
7. No iPhone, aceitar o prompt do Apple Health para os tipos solicitados.
8. Conferir em Saúde > Compartilhamento > Apps > OnlyFit se os dados estão liberados.
9. No OnlyFit, tocar em `Conectar Apple Health` e validar:
   - atividades importadas aparecem no histórico;
   - métricas aparecem em Progresso;
   - `health_connections` no Supabase fica `connected`;
   - `external_activities`, `wearable_samples_agg` e `wearable_sync_state` recebem registros `provider = healthkit`.

## Privacidade e App Store

- `NSHealthShareUsageDescription` precisa explicar os dados lidos e o benefício ao usuário.
- O OnlyFit lê dados do Apple Health; não escreve dados no HealthKit, então `NSHealthUpdateUsageDescription` não deve ser adicionado enquanto não houver escrita.
- Dados de saúde não podem ser usados para publicidade, mineração de dados ou perfilamento fora da finalidade declarada.
- Preencher App Privacy no App Store Connect incluindo coleta de dados de saúde/fitness, conta, identificadores e dados de uso conforme o que estiver ativo no release.
- Manter política de privacidade e consentimento dentro do app alinhados com LGPD.

## Segurança nativa

- Sessão Supabase no iOS nativo usa Keychain via `OnlyFitSecureStoragePlugin`.
- Não persistir payloads de Apple Health em `localStorage` no app nativo.
- O app só envia dados Apple Health para `wearables-ingest` autenticado; o backend e RLS continuam sendo a fronteira de autorização.
- Não adicionar `service_role`, secrets de pagamento ou tokens privados em `VITE_*`.

## Bloqueios que código não resolve sozinho

Sem estes itens, o app pode compilar mas não fica “pronto para produção iOS”:

- Apple Developer Program ativo.
- Bundle ID criado/confirmado no time correto.
- HealthKit Capability ativa no App ID.
- Provisioning Profile regenerado depois de ativar HealthKit/background delivery.
- Certificado de distribuição válido.
- Teste em iPhone físico.
- TestFlight/App Store Connect configurados com privacidade e screenshots.
