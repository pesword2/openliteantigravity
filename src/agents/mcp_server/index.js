/**
 * OpenLiteAntigravity MCP Server
 * 
 * Bu sunucu, Microsoft AutoGen ajanları ile OpenLiteAntigravity arasında
 * Model Context Protocol (MCP) üzerinden iletişim sağlar.
 * 
 * Özellikler:
 * - Çoklu ajan koordinasyonu (Planner, Coder, Reviewer, Executor)
 * - İnsan-onay mekanizması (Human-in-the-loop)
 * - Kod yürütme ve test sonuçları
 * - Gerçek zamanlı durum takibi
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

// Ajan Rolleri
const AGENT_ROLES = {
  PLANNER: 'planner',      // Görevleri planlar ve parçalara ayırır
  CODER: 'coder',          // Kod yazar
  REVIEWER: 'reviewer',    // Kodu inceler ve önerilerde bulunur
  EXECUTOR: 'executor',    // Kodu çalıştırır ve test eder
  ORCHESTRATOR: 'orchestrator' // Tüm ajanları koordine eder
};

// Araç Tanımları
const TOOLS = [
  {
    name: 'create_task_plan',
    description: 'Yüksek seviyeli bir görevi alt görevlere ayırır',
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'Tamamlanacak görev açıklaması' },
        complexity: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Görev karmaşıklığı' }
      },
      required: ['task']
    }
  },
  {
    name: 'generate_code',
    description: 'Belirtilen gereksinimlere göre kod üretir',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Görev kimliği' },
        requirements: { type: 'string', description: 'Kod gereksinimleri' },
        language: { type: 'string', description: 'Programlama dili' },
        existing_code: { type: 'string', description: 'Mevcut kod (varsa)' }
      },
      required: ['task_id', 'requirements', 'language']
    }
  },
  {
    name: 'review_code',
    description: 'Kodu inceler, hataları bulur ve iyileştirme önerir',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'İncelenecek kod' },
        context: { type: 'string', description: 'Kod bağlamı' }
      },
      required: ['code']
    }
  },
  {
    name: 'execute_code',
    description: 'Kodu güvenli bir sandbox ortamında çalıştırır',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Çalıştırılacak kod' },
        language: { type: 'string', description: 'Programlama dili' },
        test_input: { type: 'string', description: 'Test girdisi' }
      },
      required: ['code', 'language']
    }
  },
  {
    name: 'request_human_approval',
    description: 'Kritik değişiklikler için insan onayı ister',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'Onaylanacak eylem' },
        reason: { type: 'string', description: 'Onay nedeni' },
        changes: { type: 'string', description: 'Yapılacak değişiklikler' }
      },
      required: ['action', 'reason']
    }
  },
  {
    name: 'get_agent_status',
    description: 'Tüm ajanların mevcut durumunu döndürür',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  }
];

// Durum Yönetimi
const agentStatus = {
  planner: { status: 'idle', currentTask: null },
  coder: { status: 'idle', currentTask: null },
  reviewer: { status: 'idle', currentTask: null },
  executor: { status: 'idle', currentTask: null },
  orchestrator: { status: 'active', activeAgents: [] }
};

// MCP Sunucusu Oluşturma
const server = new Server(
  {
    name: 'openliteantigravity-mcp',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// Araçları Listele
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

// Araçları Çağır
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  console.log(`[MCP] Tool called: ${name}`, args);

  switch (name) {
    case 'create_task_plan':
      return await handleCreateTaskPlan(args);
    
    case 'generate_code':
      return await handleGenerateCode(args);
    
    case 'review_code':
      return await handleReviewCode(args);
    
    case 'execute_code':
      return await handleExecuteCode(args);
    
    case 'request_human_approval':
      return await handleHumanApproval(args);
    
    case 'get_agent_status':
      return await handleGetAgentStatus();
    
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

// Kaynakları Listele
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: 'agent://status',
        name: 'Agent Status',
        description: 'Current status of all agents',
        mimeType: 'application/json'
      },
      {
        uri: 'agent://tasks',
        name: 'Active Tasks',
        description: 'List of active tasks',
        mimeType: 'application/json'
      }
    ]
  };
});

// Kaynak Oku
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;
  
  if (uri === 'agent://status') {
    return {
      contents: [{
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(agentStatus, null, 2)
      }]
    };
  }
  
  throw new Error(`Unknown resource: ${uri}`);
});

// Araç İşleyicileri
async function handleCreateTaskPlan(args) {
  const { task, complexity = 'medium' } = args;
  
  // AutoGen Planner Agent'a yönlendirilecek
  // Şimdilik mock yanıt
  agentStatus.planner.status = 'working';
  agentStatus.planner.currentTask = task;
  
  setTimeout(() => {
    agentStatus.planner.status = 'idle';
    agentStatus.planner.currentTask = null;
  }, 5000);
  
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        task_id: `task_${Date.now()}`,
        original_task: task,
        complexity,
        subtasks: [
          { id: 1, description: 'Analyze requirements', status: 'pending' },
          { id: 2, description: 'Design solution', status: 'pending' },
          { id: 3, description: 'Implement code', status: 'pending' },
          { id: 4, description: 'Test and review', status: 'pending' }
        ],
        estimated_time: complexity === 'high' ? '2h' : '30m'
      }, null, 2)
    }]
  };
}

async function handleGenerateCode(args) {
  const { task_id, requirements, language, existing_code } = args;
  
  agentStatus.coder.status = 'working';
  agentStatus.coder.currentTask = task_id;
  
  // AutoGen Coder Agent'a yönlendirilecek
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        task_id,
        language,
        code: `// Generated code for task: ${task_id}\n// Requirements: ${requirements}\n\nconsole.log("Hello from AutoGen Coder!");`,
        files_created: ['main.js'],
        timestamp: new Date().toISOString()
      }, null, 2)
    }]
  };
}

async function handleReviewCode(args) {
  const { code, context } = args;
  
  agentStatus.reviewer.status = 'working';
  
  // AutoGen Reviewer Agent'a yönlendirilecek
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        review_status: 'completed',
        issues_found: 0,
        suggestions: [
          'Consider adding error handling',
          'Add unit tests for edge cases'
        ],
        quality_score: 8.5,
        timestamp: new Date().toISOString()
      }, null, 2)
    }]
  };
}

async function handleExecuteCode(args) {
  const { code, language, test_input } = args;
  
  agentStatus.executor.status = 'working';
  
  // AutoGen Executor Agent'a yönlendirilecek (sandbox ortamında)
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        execution_status: 'success',
        output: 'Test passed successfully!',
        exit_code: 0,
        execution_time_ms: 145,
        timestamp: new Date().toISOString()
      }, null, 2)
    }]
  };
}

async function handleHumanApproval(args) {
  const { action, reason, changes } = args;
  
  // İnsan onayı bekle (UI üzerinden)
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        approval_requested: true,
        action,
        reason,
        changes,
        status: 'pending',
        message: 'Waiting for human approval...'
      }, null, 2)
    }]
  };
}

async function handleGetAgentStatus() {
  return {
    content: [{
      type: 'text',
      text: JSON.stringify(agentStatus, null, 2)
    }]
  };
}

// Sunucuyu Başlat
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[MCP Server] OpenLiteAntigravity MCP Server started');
}

main().catch((error) => {
  console.error('[MCP Server] Fatal error:', error);
  process.exit(1);
});
