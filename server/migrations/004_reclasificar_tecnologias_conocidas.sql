-- Tecnologías que alguien registró a mano como "otro" (por ejemplo "supabase" o "Firebase")
-- cuando todavía no existían los tipos "plataforma" y "herramienta".
-- Se les pone el tipo correcto y el nombre con su escritura oficial. Los proyectos que las usan no cambian:
-- la relación va por el id, no por el nombre.
UPDATE technologies AS t
SET name = c.name, kind = c.kind
FROM (VALUES
  ('Firebase', 'plataforma'), ('Supabase', 'plataforma'), ('Appwrite', 'plataforma'), ('PocketBase', 'plataforma'),
  ('Hasura', 'plataforma'), ('Parse', 'plataforma'), ('AWS Amplify', 'plataforma'), ('Auth0', 'plataforma'),
  ('Clerk', 'plataforma'), ('Stripe', 'plataforma'), ('Twilio', 'plataforma'),
  ('Docker', 'herramienta'), ('Kubernetes', 'herramienta'), ('Git', 'herramienta'), ('Terraform', 'herramienta'),
  ('Nginx', 'herramienta')
) AS c (name, kind)
WHERE lower(t.name) = lower(c.name) AND t.kind = 'otro';
