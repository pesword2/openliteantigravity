# Microsoft AutoGen Entegrasyonu

Bu modül, Microsoft AutoGen'in çoklu ajan yeteneklerini OpenLiteAntigravity ile entegre eder.

## Kurulum

```bash
cd src/agents
npm install
```

## Çalıştırma

MCP Sunucusunu başlatmak için:

```bash
npm run start:mcp
```

Geliştirme modunda:

```bash
npm run dev:mcp
```

## Ajan Rolleri

- **Planner**: Görevleri analiz eder ve alt görevlere ayırır
- **Coder**: Kod üretir ve düzenler
- **Reviewer**: Kodu inceler, hataları bulur ve önerilerde bulunur
- **Executor**: Kodu güvenli sandbox ortamında çalıştırır
- **Orchestrator**: Tüm ajanları koordine eder ve iş akışını yönetir

## MCP Araçları

1. `create_task_plan` - Görev planı oluşturur
2. `generate_code` - Kod üretir
3. `review_code` - Kod incelemesi yapar
4. `execute_code` - Kodu çalıştırır
5. `request_human_approval` - İnsan onayı ister
6. `get_agent_status` - Ajan durumlarını getirir

## Yapılandırma

AutoGen ajanları ile bağlantı kurmak için `.env` dosyasında gerekli API anahtarlarını tanımlayın.

## Örnek Kullanım

```javascript
// Task planı oluştur
const plan = await mcpClient.callTool('create_task_plan', {
  task: 'Create a REST API endpoint for user authentication',
  complexity: 'medium'
});

// Kod üret
const code = await mcpClient.callTool('generate_code', {
  task_id: plan.task_id,
  requirements: 'JWT-based auth with refresh tokens',
  language: 'typescript'
});

// Kodu incele
const review = await mcpClient.callTool('review_code', {
  code: code.code,
  context: 'Express.js application'
});

// Onay iste (kritik değişiklikler için)
const approval = await mcpClient.callTool('request_human_approval', {
  action: 'Deploy to production',
  reason: 'New authentication system ready',
  changes: 'Added /auth/login and /auth/refresh endpoints'
});
```

## Gelecek Geliştirmeler

- [ ] Gerçek AutoGen Python servisi ile entegrasyon
- [ ] WebSocket tabanlı gerçek zamanlı iletişim
- [ ] Gelişmiş sandbox güvenlik mekanizmaları
- [ ] Ajanlar arası hafıza paylaşımı
- [ ] Çoklu dil desteği
