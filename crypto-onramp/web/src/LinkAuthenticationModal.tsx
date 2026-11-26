import * as React from 'react';
import {Dialog, DialogContent} from '@mui/material';

type Props = {
  open: boolean;
  setOpen: (open: boolean) => void;
  element: HTMLElement;
};

export function LinkAuthenticationModal({open, setOpen, element}: Props) {
  const containerRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      if (node && !node.contains(element)) {
        node.appendChild(element);
      }
    },
    [element],
  );

  return (
    <Dialog
      open={open}
      onClose={() => setOpen(false)}
      maxWidth={false}
      slotProps={{paper: {sx: {borderRadius: 3, minWidth: 360, bgcolor: 'transparent', backgroundImage: 'none'}}}}
    >
      <DialogContent sx={{p: 0, m: 0, '&:first-of-type': {p: 0}}}>
        <div ref={containerRef} style={{width: '100%', height: '100%'}}/>
      </DialogContent>
    </Dialog>
  );
}
