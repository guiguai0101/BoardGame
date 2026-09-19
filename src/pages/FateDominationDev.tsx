import React from 'react';

/** 独立开发版通过 iframe 挂载，避免与大厅运行时共享游戏状态。 */
export const FateDominationDev: React.FC = () => (
  <iframe
    title="Fate/Domination 独立开发版"
    src="/fate-domination-dev/index.html"
    style={{
      display: 'block',
      width: '100%',
      height: '100dvh',
      border: 0,
      background: '#111827',
    }}
  />
);

export default FateDominationDev;
