const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

type TaskbarElements = {
  taskbar: HTMLElement;
  handle: HTMLElement;
  panel: HTMLElement | null;
};

const toggleInert = (element: HTMLElement | null, inert: boolean) => {
  if (!element) {
    return;
  }
  element.setAttribute('aria-hidden', inert ? 'true' : 'false');
  if (inert) {
    element.setAttribute('inert', '');
  } else {
    element.removeAttribute('inert');
  }
};

const setTaskbarOpenState = (elements: TaskbarElements, isOpen: boolean) => {
  const { taskbar, handle, panel } = elements;
  taskbar.classList.toggle('chatter-stage__taskbar--open', isOpen);
  handle.setAttribute('aria-expanded', String(isOpen));
  toggleInert(panel, !isOpen);
};

const resetDragState = (taskbar: HTMLElement) => {
  taskbar.classList.remove('chatter-stage__taskbar--dragging');
  taskbar.style.setProperty('--taskbar-drag-offset', '0px');
};

export const enhanceTaskbar = (root: HTMLElement) => {
  const taskbar = root.querySelector<HTMLElement>('[data-taskbar]');
  const handle = root.querySelector<HTMLElement>('[data-taskbar-handle]');
  const panel = root.querySelector<HTMLElement>('[data-taskbar-panel]');

  if (!taskbar || !handle) {
    return () => {};
  }

  const elements: TaskbarElements = { taskbar, handle, panel };
  let isOpen = taskbar.classList.contains('chatter-stage__taskbar--open');
  let dragStartY: number | null = null;
  let activePointerId: number | null = null;
  let dragMoved = false;

  const updateState = () => {
    setTaskbarOpenState(elements, isOpen);
  };

  updateState();

  const handlePointerDown = (event: PointerEvent) => {
    dragStartY = event.clientY;
    activePointerId = event.pointerId;
    dragMoved = false;
    handle.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent) => {
    if (activePointerId !== event.pointerId || dragStartY === null) {
      return;
    }
    const delta = event.clientY - dragStartY;
    if (!dragMoved && Math.abs(delta) > 6) {
      dragMoved = true;
    }
    const limited = clamp(delta, -200, 200);
    const adjusted = isOpen ? Math.min(0, limited) : Math.max(0, limited);
    taskbar.classList.add('chatter-stage__taskbar--dragging');
    taskbar.style.setProperty('--taskbar-drag-offset', `${adjusted}px`);
  };

  const concludePointerGesture = (event: PointerEvent) => {
    if (activePointerId !== event.pointerId) {
      return;
    }
    if (dragStartY !== null) {
      const delta = event.clientY - dragStartY;
      if (!isOpen && delta > 45) {
        isOpen = true;
      } else if (isOpen && delta < -45) {
        isOpen = false;
      }
      updateState();
    }
    dragStartY = null;
    activePointerId = null;
    resetDragState(taskbar);
    if (handle.hasPointerCapture(event.pointerId)) {
      handle.releasePointerCapture(event.pointerId);
    }
  };

  const cancelPointerGesture = (event: PointerEvent) => {
    if (activePointerId !== event.pointerId) {
      return;
    }
    dragStartY = null;
    activePointerId = null;
    dragMoved = false;
    resetDragState(taskbar);
    if (handle.hasPointerCapture(event.pointerId)) {
      handle.releasePointerCapture(event.pointerId);
    }
  };

  const handleClick = (event: MouseEvent) => {
    if (dragMoved) {
      dragMoved = false;
      event.preventDefault();
      return;
    }
    isOpen = !isOpen;
    updateState();
  };

  handle.addEventListener('pointerdown', handlePointerDown);
  handle.addEventListener('pointermove', handlePointerMove);
  handle.addEventListener('pointerup', concludePointerGesture);
  handle.addEventListener('pointercancel', cancelPointerGesture);
  handle.addEventListener('click', handleClick);

  return () => {
    handle.removeEventListener('pointerdown', handlePointerDown);
    handle.removeEventListener('pointermove', handlePointerMove);
    handle.removeEventListener('pointerup', concludePointerGesture);
    handle.removeEventListener('pointercancel', cancelPointerGesture);
    handle.removeEventListener('click', handleClick);
    resetDragState(taskbar);
    setTaskbarOpenState(elements, false);
  };
};
