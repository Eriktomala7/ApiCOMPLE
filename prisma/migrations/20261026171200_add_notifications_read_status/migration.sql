CREATE TABLE "Notificacion" (
    "id" SERIAL NOT NULL,
    "id_usuario" INTEGER NOT NULL,
    "id_solicitud" INTEGER,
    "id_producto" INTEGER,
    "tipo" TEXT NOT NULL,
    "mensaje" TEXT NOT NULL,
    "fecha" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leida" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Notificacion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Notificacion_id_usuario_leida_fecha_idx"
    ON "Notificacion"("id_usuario", "leida", "fecha");

ALTER TABLE "Notificacion"
    ADD CONSTRAINT "Notificacion_id_usuario_fkey"
    FOREIGN KEY ("id_usuario") REFERENCES "Usuario"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Notificacion"
    ADD CONSTRAINT "Notificacion_id_solicitud_fkey"
    FOREIGN KEY ("id_solicitud") REFERENCES "Solicitud"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Notificacion"
    ADD CONSTRAINT "Notificacion_id_producto_fkey"
    FOREIGN KEY ("id_producto") REFERENCES "Producto"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "Notificacion" ("id_usuario", "id_solicitud", "id_producto", "tipo", "mensaje", "fecha", "leida")
SELECT administrador."id",
       solicitud."id",
       solicitud."id_producto",
       'PENDIENTE',
       usuario."nombre" || ' solicitó ' || solicitud."cantidad" || ' ' || producto."nombre",
       solicitud."fecha",
       false
FROM "Solicitud" solicitud
JOIN "Usuario" usuario ON usuario."id" = solicitud."id_usuario"
JOIN "Producto" producto ON producto."id" = solicitud."id_producto"
CROSS JOIN "Usuario" administrador
WHERE administrador."rol" = 'ADMIN'
  AND administrador."estado" = 'ACTIVO'
  AND solicitud."estado" = 'ACTIVO'
  AND solicitud."estado_solicitud" = 'PENDIENTE';

INSERT INTO "Notificacion" ("id_usuario", "id_solicitud", "id_producto", "tipo", "mensaje", "fecha", "leida")
SELECT solicitud."id_usuario",
       solicitud."id",
       solicitud."id_producto",
       solicitud."estado_solicitud"::TEXT,
       'Tu solicitud de ' || solicitud."cantidad" || ' ' || producto."nombre" || ' fue ' ||
           CASE
               WHEN solicitud."estado_solicitud" = 'APROBADA' THEN 'aprobada'
               ELSE 'rechazada'
           END,
       solicitud."fecha",
       false
FROM "Solicitud" solicitud
JOIN "Producto" producto ON producto."id" = solicitud."id_producto"
WHERE solicitud."estado_solicitud" IN ('APROBADA', 'RECHAZADA')
  AND solicitud."estado" = 'ACTIVO';

INSERT INTO "Notificacion" ("id_usuario", "id_producto", "tipo", "mensaje", "fecha", "leida")
SELECT administrador."id",
       producto."id",
       'STOCK_AGOTADO',
       'El producto ' || producto."nombre" || ' (' || producto."codigo" || ') se agotó y fue deshabilitado.',
       CURRENT_TIMESTAMP,
       false
FROM "Producto" producto
CROSS JOIN "Usuario" administrador
WHERE administrador."rol" = 'ADMIN'
  AND administrador."estado" = 'ACTIVO'
  AND producto."cantidad" = 0
  AND producto."estado" = 'INACTIVO';
