// src/routes/sections.js
import createEntityRouter from '../../utils/entity-router-factory.js';

export default function(pool) {
  return createEntityRouter(pool, 'section', 'sections');
}