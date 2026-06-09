import * as React from 'react';

export const SidebarContext = React.createContext({
  isCollapsed: false,
  toggleSidebar: () => {},
  setShowProfile: (_v: boolean) => {}
});
