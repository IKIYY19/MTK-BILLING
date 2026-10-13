const dgram = require("dgram");
const crypto = require("crypto");
const logger = require("../utils/logger");

function md5(data) {
  return crypto.createHash("md5").update(data).digest();
}

function buildDisconnectPacket(username, nasIpAddress, secret) {
  const authenticator = crypto.randomBytes(16);
  const attrs = [];

  function addAttr(type, value) {
    const buf = Buffer.alloc(2 + value.length);
    buf.writeUInt8(type, 0);
    buf.writeUInt8(value.length + 2, 1);
    if (Buffer.isBuffer(value)) {value.copy(buf, 2);}
    else {Buffer.from(String(value)).copy(buf, 2);}
    attrs.push(buf);
  }

  addAttr(1, username);
  addAttr(44, Buffer.from([0, 0, 0, 0]));
  addAttr(4, Buffer.from(nasIpAddress.split(".").map(Number)));
  attrs.sort((a, b) => a[0] - b[0]);

  const attrBlock = Buffer.concat(attrs);
  const packetLen = 20 + attrBlock.length;
  const buf = Buffer.alloc(packetLen);

  buf.writeUInt8(40, 0);
  buf.writeUInt8(0, 1);
  buf.writeUInt16BE(packetLen, 2);
  authenticator.copy(buf, 4);
  buf.writeUInt8(0, 16);
  buf.writeUInt8(0, 17);
  attrBlock.copy(buf, 20);

  const sigInput = Buffer.concat([buf.subarray(0, 4), Buffer.alloc(16), buf.subarray(20)]);
  const sig = md5(Buffer.concat([md5(sigInput.toString("binary") + secret, "binary"), sigInput]));
  sig.copy(buf, 4);

  return buf;
}

async function sendDisconnect({ username, nasIpAddress, nasSecret, radiusPort }) {
  return new Promise((resolve, reject) => {
    const packet = buildDisconnectPacket(username, nasIpAddress, nasSecret || "testing123");
    const port = radiusPort || 3799;
    const socket = dgram.createSocket("udp4");

    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error("PoD timeout"));
    }, 5000);

    socket.on("error", (err) => {
      clearTimeout(timeout);
      socket.close();
      reject(err);
    });

    socket.on("message", (msg) => {
      clearTimeout(timeout);
      socket.close();
      const code = msg.readUInt8(0);
      if (code === 41) {
        resolve({ success: true, message: "Disconnect acknowledged" });
      } else if (code === 42) {
        resolve({ success: true, message: "CoA acknowledged" });
      } else {
        resolve({ success: false, message: `Unexpected response code: ${code}` });
      }
    });

    socket.send(packet, port, nasIpAddress, (err) => {
      if (err) {
        clearTimeout(timeout);
        socket.close();
        reject(err);
      }
    });
  });
}

async function kickUser(username, subscription) {
  if (!subscription || !username) {
    return { success: false, error: "Missing username or subscription" };
  }

  const db = global.dbAvailable ? global.db : require("../db/memory");

  try {
    const nasResult = await db.query(
      "SELECT nasname, secret FROM nas WHERE connection_id = $1 LIMIT 1",
      [subscription.mikrotik_connection_id],
    );

    let nasIp, nasSecret;
    if (nasResult.rows.length > 0) {
      nasIp = nasResult.rows[0].nasname;
      nasSecret = nasResult.rows[0].secret;
    } else {
      const connResult = await db.query(
        "SELECT ip_address FROM mikrotik_connections WHERE id = $1",
        [subscription.mikrotik_connection_id],
      );
      if (connResult.rows.length === 0) {
        return { success: false, error: "No MikroTik connection found for PoD" };
      }
      nasIp = connResult.rows[0].ip_address;
      nasSecret = process.env.RADIUS_SECRET || "testing123";
    }

    const result = await sendDisconnect({
      username,
      nasIpAddress: nasIp,
      nasSecret,
      radiusPort: parseInt(process.env.RADIUS_POD_PORT || "3799"),
    });

    logger.info(`[PoD] Kicked user ${username} from ${nasIp}`);
    return { success: true, ...result };
  } catch (e) {
    logger.error(`[PoD] Failed to kick ${username}: ${e.message}`);
    return { success: false, error: e.message };
  }
}

module.exports = { sendDisconnect, kickUser };
