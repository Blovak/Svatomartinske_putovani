export function pointMarkerStyle() {
  return {
    radius: 11,
    color: '#ffffff',
    weight: 3,
    fillColor: '#a74932',
    fillOpacity: 1
  };
}

export function isFinishPoint(point) {
  const name = String(point.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  return /^cil(?:$|\s|[-–—:])/i.test(name);
}

export const finishMarkerHtml = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 42" aria-hidden="true"><path d="M7 39V4" stroke="#fff" stroke-width="7" stroke-linecap="round"/><path d="M7 39V4" stroke="#263d36" stroke-width="3" stroke-linecap="round"/><path d="M8 5h23v20H8z" fill="#fff" stroke="#263d36" stroke-width="2"/><path d="M8 5h8v7H8zm15 0h8v7h-8zm-7 7h7v6h-7zm-8 6h8v7H8zm15 0h8v7h-8z" fill="#263d36"/></svg>';
