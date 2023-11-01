const WebSocket = require('ws');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const WS_PORT = 8765;
const HTTP_PORT = 8766;
const presetConfig = {
  summary:
    '请用中文为这篇技术博文生成一个精炼的AI摘要，聚焦文章的核心技术和方法，快速概述其创新点和实用价值，使读者能够快速把握文章的重点和整体框架，提供一个高效的内容概览（150字以内，视文章长度适当增减）：',
};
class WebSocketServer {
  constructor() {
    this.server = new WebSocket.Server({ port: WS_PORT });
    this.connectedSocket = null;
    this.initialize();
  }

  initialize() {
    this.server.on('connection', (socket) => {
      this.connectedSocket = socket;
      console.log('Browser connected, can process requests now.');

      socket.on('close', () => {
        console.log('The browser connection has been disconnected, the request cannot be processed.');
        this.connectedSocket = null;
      });
    });

    console.log('WebSocket server is running');
  }

  async sendRequest(request, callback) {
    if (!this.connectedSocket) {
      callback('stop', 'api error');
      console.log('The browser connection has not been established, the request cannot be processed.');
      return;
    }

    this.connectedSocket.send(JSON.stringify(request));

    let text = '';
    const handleMessage = (message) => {
      const data = message;
      const jsonString = data.toString('utf8');
      const jsonObject = JSON.parse(jsonString);

      if (jsonObject.type === 'stop') {
        this.connectedSocket.off('message', handleMessage);
        callback('stop', text);
      } else if (jsonObject.type === 'answer') {
        console.log('answer:', jsonObject.text);
        text = jsonObject.text;
        callback('answer', text);
      }
    };
    this.connectedSocket.on('message', handleMessage);
  }
}

const webSocketServer = new WebSocketServer();

const app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors());

app.post('/v1/chat/completions', async function (req, res) {
  const { messages, model, stream, newChat = true, payload, type } = req.body;
  const { prefix, suffix } = payload ?? {}; // suffix
  if (stream) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
  }

  console.log('request body', req.body);
  const preset = presetConfig?.[type] ?? '';
  const requestPayload = (prefix ?? '') + preset + messages + (suffix ?? '');

  let lastResponse = '';
  webSocketServer.sendRequest(
    {
      text: requestPayload,
      model: model,
      newChat,
    },
    (type, response) => {
      try {
        response = response.trim();
        let deltaContent = '';
        if (lastResponse) {
          const index = response.indexOf(lastResponse);
          deltaContent = index >= 0 ? response.slice(index + lastResponse.length) : response;
        } else {
          deltaContent = response;
        }
        const result = {
          choices: [
            {
              message: { content: response },
              delta: { content: deltaContent },
            },
          ],
        };
        lastResponse = response;
        if (type === 'stop') {
          if (stream) {
            res.write(`id: ${Date.now()}\n`);
            res.write(`event: event\n`);
            res.write('data: [DONE]\n\n');
            res.end();
          } else {
            res.send(result);
          }
        } else {
          if (stream) {
            res.write(`id: ${Date.now()}\n`);
            res.write(`event: event\n`);
            res.write(`data: ${JSON.stringify(result)}\n\n`);
          }
        }
        console.log('result', result);
      } catch (error) {
        console.log('error', error);
      }
    },
  );
});

app.listen(HTTP_PORT, function () {
  console.log(`Application example, access address is http://localhost:${HTTP_PORT}/v1/chat/completions`);
});
