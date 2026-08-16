const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { isDBConnected } = require('../db');
const { AuditLogModel } = require('../models');

const AUDIT_FILE = path.join(__dirname, '..', 'data', 'audit_logs.json');

function readFileLogs() {
  try {
    return fs.existsSync(AUDIT_FILE) ? JSON.parse(fs.readFileSync(AUDIT_FILE, 'utf8')) : [];
  } catch (err) {
    console.error('Error loading audit_logs.json:', err.message);
    return [];
  }
}

function writeFileLogs(logs) {
  fs.mkdirSync(path.dirname(AUDIT_FILE), { recursive: true });
  fs.writeFileSync(AUDIT_FILE, JSON.stringify(logs, null, 2), 'utf8');
}

async function recordLog({ actorId, actorRole, storeId, branchId, action, target, details }) {
  const logEntry = {
    id: crypto.randomUUID(),
    actorId: actorId || null,
    actorRole: actorRole || null,
    storeId: storeId || null,
    branchId: branchId || null,
    action,
    target: target || '',
    details: details || {},
    timestamp: new Date()
  };

  try {
    if (isDBConnected()) {
      await AuditLogModel.create(logEntry);
    } else {
      const logs = readFileLogs();
      logs.push({ ...logEntry, timestamp: logEntry.timestamp.toISOString() });
      writeFileLogs(logs);
    }
  } catch (err) {
    console.error('⚠️ Failed to record audit log:', err.message);
  }
  return logEntry;
}

module.exports = {
  recordLog
};
