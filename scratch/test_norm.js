const expected = "bucket_id = 'public-assets' AND (storage.foldername(name))[1] = 'avatars' AND array_length(storage.foldername(name), 1) = 1 AND storage.filename(name) ~ ('^' || (auth.uid())::text || '\\.(png|jpg|jpeg|webp|gif)$')";
const decompiled = "((bucket_id = 'public-assets'::text) AND ((storage.foldername(name))[1] = 'avatars'::text) AND (array_length(storage.foldername(name), 1) = 1) AND (storage.filename(name) ~ (('^'::text || (auth.uid())::text) || '\\.(png|jpg|jpeg|webp|gif)$'::text)))";

function norm(s) {
  return s.replace(/::text/g, '').replace(/[()\s]/g, '');
}

console.log("Expected:  ", norm(expected));
console.log("Decompiled:", norm(decompiled));
console.log("Matches:   ", norm(expected) === norm(decompiled));
