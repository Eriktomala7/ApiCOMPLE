export function transformarBooleanoQuery(value: unknown): unknown {
  if (value === true || value === 'true') {
    return true;
  }
  if (value === false || value === 'false') {
    return false;
  }
  return value;
}

export function transformarTipoMovimientoQuery(value: unknown): unknown {
  return typeof value === 'string' ? value.toUpperCase() : value;
}
