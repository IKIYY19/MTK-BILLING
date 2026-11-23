import React from 'react';

export function Traffic({ rxBps, txBps, rxRate, txRate, max }) {
  const width = (value) => `${Math.min(100, Math.round((value / (max || 1)) * 100))}%`;
  return (
    <div className="lb-traffic">
      <div className="lb-traffic__row">
        <span>↓</span>
        <div className="lb-bar"><i style={{ width: width(rxBps || 0) }} /></div>
        <span>{rxRate || '0 bps'}</span>
      </div>
      <div className="lb-traffic__row">
        <span>↑</span>
        <div className="lb-bar"><i style={{ width: width(txBps || 0) }} /></div>
        <span>{txRate || '0 bps'}</span>
      </div>
    </div>
  );
}
