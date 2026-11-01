# Notas de Versão — Nada Sai (Google Play Store)

Este documento contém o **Nome da Versão** e as **Notas da Versão** (*What's new*) para preenchimento na Google Play Console ao criar ou promover um lançamento.

O Google Play impõe um limite estrito de **500 caracteres** por idioma para as notas da versão. O script `npm run store:check` valida esses limites.

---

## 1. Lançamento Inicial (v1.0.0)

Utilize estes dados se este for o primeiro envio da aplicação à Google Play Console (`versionCode 1`, `versionName 1.0.0`).

### Nome da versão (Release name)
```
1.0.0
```
*(ou `1.0.0 (1) - Lançamento Oficial`)*

### Notas da versão (Release notes)

#### Português (pt-BR) — 434 / 500 caracteres
```text
Primeira versão oficial do Nada Sai:
• 57 ferramentas para PDF, imagem, áudio e vídeo que rodam 100% no seu aparelho.
• Sem permissão de internet: total privacidade, seus arquivos nunca saem do celular.
• Salvamento nativo direto na pasta Downloads com confirmação instantânea.
• Remoção de fundo por IA no processador e corte de vídeo por aceleração de hardware.
• Funciona sem login, sem cadastro, sem anúncios e totalmente offline.
```

#### Inglês (en-US) — 410 / 500 caracteres
```text
Initial release of Nada Sai:
• 57 tools for PDF, image, audio, and video running 100% on your device.
• Zero internet permission: total privacy, your files never leave your phone.
• Direct native file saving to your Downloads folder with instant visual confirmation.
• On-device AI background removal and hardware-accelerated video trimming.
• Works completely offline with no account, no ads, and no trackers.
```

---

## 2. Atualização / Correção de Salvamento (v1.0.1)

Caso já tenha enviado anteriormente um pacote com `versionCode 1` para o Play Console (teste interno/fechado), a loja exigirá subir o `versionCode` para `2` e `versionName` para `1.0.1` em `android/app/build.gradle`.

### Nome da versão (Release name)
```
1.0.1
```
*(ou `1.0.1 (2) - Salvamento Nativo no Dispositivo`)*

### Notas da versão (Release notes)

#### Português (pt-BR) — 414 / 500 caracteres
```text
Novidades desta versão:
• Salvamento nativo: arquivos processados agora são salvos diretamente na pasta Downloads do seu aparelho, com confirmação visual imediata.
• Gerenciamento automático de armazenamento e suporte aprimorado no Android.
• 57 ferramentas para PDF, imagem, áudio e vídeo com privacidade absoluta: o app não tem permissão de internet e roda 100% offline.
• Melhorias de desempenho e estabilidade.
```

#### Inglês (en-US) — 356 / 500 caracteres
```text
What's new:
• Native file saving: processed files are now saved directly into your device's Downloads folder, with immediate visual confirmation.
• Improved storage permissions handling and Android integration.
• 57 tools for PDF, image, audio, and video with total privacy: zero internet permission, 100% offline.
• Performance and stability enhancements.
```

---

## Onde colar no Google Play Console

1. No Google Play Console, acesse **Produção** (ou **Teste Fechado** / **Teste Interno**).
2. Clique em **Criar nova versão**.
3. Faça o upload do pacote `android/app/build/outputs/bundle/release/app-release.aab`.
4. No campo **Nome da versão**, digite `1.0.0` (ou deixe o padrão gerado pelo Play Console).
5. No campo **Notas da versão**:
   - Clique na aba **Português (Brasil)** e cole o texto em PT-BR.
   - Clique em **Adicionar idioma** → **Inglês (Estados Unidos)** e cole o texto em EN-US.
6. Clique em **Salvar** e **Avaliar versão**.
