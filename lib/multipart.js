'use strict';

const { ValidationError } = require('./store');

const MAX_PARTS = 24;

function parseMultipart(buffer, contentType) {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '');
  const boundary = (match && (match[1] || match[2]) || '').trim();
  if (!boundary) throw new ValidationError('上传格式缺少分隔标识。');

  const first = Buffer.from('--' + boundary, 'utf8');
  const separator = Buffer.from('\r\n--' + boundary, 'utf8');
  let pointer = buffer.indexOf(first);
  if (pointer < 0) throw new ValidationError('上传内容格式不正确。');
  pointer += first.length;
  if (buffer.subarray(pointer, pointer + 2).toString() === '--') {
    return { fields: {}, files: [] };
  }
  if (buffer.subarray(pointer, pointer + 2).toString() !== '\r\n') {
    throw new ValidationError('上传内容格式不正确。');
  }
  pointer += 2;

  const fields = {};
  const files = [];

  for (let index = 0; index < MAX_PARTS; index += 1) {
    const headEnd = buffer.indexOf('\r\n\r\n', pointer);
    if (headEnd < 0) throw new ValidationError('上传内容不完整。');

    const headerText = buffer.subarray(pointer, headEnd).toString('utf8');
    const disposition = /content-disposition:\s*([^\r\n]+)/i.exec(headerText);
    if (!disposition) throw new ValidationError('上传内容缺少文件信息。');
    const params = {};
    const paramPattern = /;\s*([a-zA-Z*]+)="([^"]*)"/g;
    let param;
    while ((param = paramPattern.exec(disposition[1])) !== null) {
      params[param[1].toLowerCase()] = param[2];
    }
    const fieldName = params.name;
    if (!fieldName) throw new ValidationError('上传字段名不正确。');

    const next = buffer.indexOf(separator, headEnd + 4);
    if (next < 0) throw new ValidationError('上传内容不完整。');
    const data = buffer.subarray(headEnd + 4, next);

    if (Object.prototype.hasOwnProperty.call(params, 'filename')) {
      const safeName = String(params.filename || '')
        .replace(/\\/g, '/')
        .split('/')
        .filter(Boolean)
        .pop() || 'backup.zip';
      files.push({ field: fieldName, filename: safeName, data });
    } else {
      fields[fieldName] = data.toString('utf8');
    }

    pointer = next + separator.length;
    if (buffer.subarray(pointer, pointer + 2).toString() === '--') {
      return { fields, files };
    }
    if (buffer.subarray(pointer, pointer + 2).toString() !== '\r\n') {
      throw new ValidationError('上传内容格式不正确。');
    }
    pointer += 2;
  }

  throw new ValidationError('上传内容包含过多字段。');
}

module.exports = { parseMultipart };
