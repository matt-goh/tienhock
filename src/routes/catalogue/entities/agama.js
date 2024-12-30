// src/routes/agama.js
import createEntityRouter from '../../utils/entity-router-factory.js';

export default function(pool) {
  return createEntityRouter(pool, 'agama', 'agama');
}