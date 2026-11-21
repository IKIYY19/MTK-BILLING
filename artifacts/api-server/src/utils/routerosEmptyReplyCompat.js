const { Channel } = require("node-routeros/dist/Channel");

const processPacket = Channel.prototype.processPacket;

Channel.prototype.processPacket = function (packet) {
  if (Array.isArray(packet) && packet[0] === "!empty") {
    return;
  }
  return processPacket.call(this, packet);
};

module.exports = { Channel };
