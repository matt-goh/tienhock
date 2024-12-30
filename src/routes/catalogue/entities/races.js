// src/routes/races.js
import createEntityRouter from '../../utils/entity-router-factory.js';

export default function(pool) {
  return createEntityRouter(pool, 'race', 'races');
}