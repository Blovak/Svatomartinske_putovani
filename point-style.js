export function pointMarkerStyle(visited) {
  return {
    radius: 11,
    color: '#ffffff',
    weight: 3,
    fillColor: visited ? '#277451' : '#a74932',
    fillOpacity: 1
  };
}
