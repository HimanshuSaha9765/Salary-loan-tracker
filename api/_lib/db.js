import "dotenv/config";
import { neon } from "@neondatabase/serverless";

const MAX_CONCURRENT = 10;
let activeCount = 0;
let waitQueue = [];
let sql = createConnection();
let keepAliveTimer;

function createConnection() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is missing");
  }

  return neon(process.env.DATABASE_URL);
}

function shouldRetry(error) {
  const message = String(error.message || error);

  return (
    message.includes("fetch failed") ||
    message.includes("ECONNRESET") ||
    message.includes("connect ETIMEDOUT")
  );
}

function waitForSlot() {
  if (activeCount < MAX_CONCURRENT) {
    activeCount += 1;
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    waitQueue.push(resolve);
  });
}

function releaseSlot() {
  activeCount -= 1;

  const next = waitQueue.shift();

  if (next) {
    activeCount += 1;
    next();
  }
}

function pause(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function execute(text, values) {
  return sql.query(text, values);
}

export async function query(text, values = []) {
  await waitForSlot();

  try {
    return await execute(text, values);
  } catch (error) {
    if (!shouldRetry(error)) {
      throw error;
    }

    await pause(500);
    sql = createConnection();
    return execute(text, values);
  } finally {
    releaseSlot();
  }
}

export async function warmDatabase() {
  await query("SELECT 1");
}

export function startDatabaseKeepAlive() {
  if (keepAliveTimer) {
    return;
  }

  keepAliveTimer = setInterval(() => {
    query("SELECT 1").catch(() => {});
  }, 240000);
}
