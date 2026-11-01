package com.nadasai.app;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Log;
import android.webkit.MimeTypeMap;
import android.widget.Toast;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Salva arquivos baixados/modificados no armazenamento do aparelho (pasta Downloads).
 *
 * No WebView do Android, clicar em `<a download href="blob:...">` nao dispara download
 * nenhum por padrao — o WebView ignora navegacoes e downloads de blob URLs em silencio.
 * Alem disso, o `file-saver` depende dessa tag, o que deixava o app inteiro sem conseguir
 * salvar nada nos aparelhos reais.
 *
 * Este plugin recebe os bytes do JavaScript (em base64 direto ou em pedacos para arquivos
 * grandes) e grava no MediaStore (Android 10+ / API 29+) ou no diretorio publico de Downloads
 * (Android 9 e anteriores), pedindo permissao em tempo de execucao apenas onde ela e exigida.
 */
@CapacitorPlugin(
    name = "NadaSaiSave",
    permissions = {
        @Permission(
            alias = "storage",
            strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE }
        )
    }
)
public class SavePlugin extends Plugin {

    private static final String TAG = "NadaSaiSave";

    private static class SaveSession {
        final String id;
        final String name;
        final String mimeType;
        final OutputStream out;
        final Uri uri;
        final File file;

        SaveSession(String id, String name, String mimeType, OutputStream out, Uri uri, File file) {
            this.id = id;
            this.name = name;
            this.mimeType = mimeType;
            this.out = out;
            this.uri = uri;
            this.file = file;
        }
    }

    private final Map<String, SaveSession> activeSessions = new ConcurrentHashMap<>();

    private boolean isStoragePermissionRequired() {
        return Build.VERSION.SDK_INT <= Build.VERSION_CODES.P;
    }

    private boolean hasStoragePermission() {
        if (!isStoragePermissionRequired()) {
            return true;
        }
        return getPermissionState("storage") == PermissionState.GRANTED;
    }

    @PluginMethod
    public void checkPermission(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", hasStoragePermission());
        ret.put("required", isStoragePermissionRequired());
        call.resolve(ret);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (!isStoragePermissionRequired() || hasStoragePermission()) {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            call.resolve(ret);
            return;
        }
        requestPermissionForAlias("storage", call, "permissionCallback");
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        boolean granted = hasStoragePermission();
        JSObject ret = new JSObject();
        ret.put("granted", granted);
        if (granted) {
            call.resolve(ret);
        } else {
            showToast(isPt() ? "Permissão para salvar arquivos negada." : "Storage permission denied.");
            call.reject("Permissão para salvar arquivos negada", "PERMISSION_DENIED");
        }
    }

    @PluginMethod
    public void saveFile(PluginCall call) {
        String name = call.getString("name");
        String mimeType = call.getString("mimeType");
        String base64Data = call.getString("data");
        String customToast = call.getString("toastMessage");

        if (name == null || base64Data == null) {
            call.reject("Faltam parâmetros name ou data", "BAD_REQUEST");
            return;
        }

        if (isStoragePermissionRequired() && !hasStoragePermission()) {
            requestPermissionForAlias("storage", call, "saveFileWithPermission");
            return;
        }

        new Thread(() -> performSave(call, name, mimeType, base64Data, customToast), "nadasai-save").start();
    }

    @PermissionCallback
    private void saveFileWithPermission(PluginCall call) {
        if (!hasStoragePermission()) {
            showToast(isPt() ? "Permissão para salvar arquivos negada." : "Storage permission denied.");
            call.reject("Permissão para salvar arquivos negada", "PERMISSION_DENIED");
            return;
        }
        String name = call.getString("name");
        String mimeType = call.getString("mimeType");
        String base64Data = call.getString("data");
        String customToast = call.getString("toastMessage");
        new Thread(() -> performSave(call, name, mimeType, base64Data, customToast), "nadasai-save").start();
    }

    private void performSave(PluginCall call, String name, String mimeType, String base64Data, String customToast) {
        try {
            byte[] bytes = Base64.decode(base64Data, Base64.DEFAULT);
            String resolvedMime = resolveMimeType(name, mimeType);
            TargetStream target = createTarget(name, resolvedMime);

            try (OutputStream os = target.out) {
                os.write(bytes);
                os.flush();
            }

            finalizeTarget(target);

            String toastText = customToast != null && !customToast.isEmpty()
                ? customToast
                : (isPt() ? "Salvo em Downloads: " + name : "Saved to Downloads: " + name);
            showToast(toastText);

            JSObject res = new JSObject();
            res.put("success", true);
            res.put("name", name);
            if (target.uri != null) {
                res.put("uri", target.uri.toString());
            }
            if (target.file != null) {
                res.put("path", target.file.getAbsolutePath());
            }
            call.resolve(res);
        } catch (Throwable e) {
            Log.e(TAG, "Falha ao salvar arquivo " + name, e);
            call.reject("Falha ao salvar arquivo: " + e.getMessage(), "IO_ERROR");
        }
    }

    @PluginMethod
    public void startSave(PluginCall call) {
        String name = call.getString("name");
        String mimeType = call.getString("mimeType");

        if (name == null) {
            call.reject("Falta parâmetro name", "BAD_REQUEST");
            return;
        }

        if (isStoragePermissionRequired() && !hasStoragePermission()) {
            requestPermissionForAlias("storage", call, "startSaveWithPermission");
            return;
        }

        new Thread(() -> performStartSave(call, name, mimeType), "nadasai-save-start").start();
    }

    @PermissionCallback
    private void startSaveWithPermission(PluginCall call) {
        if (!hasStoragePermission()) {
            showToast(isPt() ? "Permissão para salvar arquivos negada." : "Storage permission denied.");
            call.reject("Permissão para salvar arquivos negada", "PERMISSION_DENIED");
            return;
        }
        String name = call.getString("name");
        String mimeType = call.getString("mimeType");
        new Thread(() -> performStartSave(call, name, mimeType), "nadasai-save-start").start();
    }

    private void performStartSave(PluginCall call, String name, String mimeType) {
        try {
            String resolvedMime = resolveMimeType(name, mimeType);
            TargetStream target = createTarget(name, resolvedMime);
            String id = UUID.randomUUID().toString();
            SaveSession session = new SaveSession(id, name, resolvedMime, target.out, target.uri, target.file);
            activeSessions.put(id, session);

            JSObject res = new JSObject();
            res.put("id", id);
            call.resolve(res);
        } catch (Throwable e) {
            Log.e(TAG, "Falha ao iniciar salvamento de " + name, e);
            call.reject("Falha ao iniciar gravação: " + e.getMessage(), "IO_ERROR");
        }
    }

    @PluginMethod
    public void appendChunk(PluginCall call) {
        String id = call.getString("id");
        String base64Data = call.getString("data");

        if (id == null || base64Data == null) {
            call.reject("Faltam parâmetros id ou data", "BAD_REQUEST");
            return;
        }

        SaveSession session = activeSessions.get(id);
        if (session == null) {
            call.reject("Sessão não encontrada", "NOT_FOUND");
            return;
        }

        new Thread(() -> {
            try {
                byte[] bytes = Base64.decode(base64Data, Base64.DEFAULT);
                session.out.write(bytes);
                JSObject res = new JSObject();
                res.put("success", true);
                call.resolve(res);
            } catch (Throwable e) {
                Log.e(TAG, "Falha ao gravar pedaço do arquivo " + session.name, e);
                call.reject("Falha na gravação do pedaço: " + e.getMessage(), "IO_ERROR");
            }
        }, "nadasai-save-chunk").start();
    }

    @PluginMethod
    public void finishSave(PluginCall call) {
        String id = call.getString("id");
        String customToast = call.getString("toastMessage");

        if (id == null) {
            call.reject("Falta parâmetro id", "BAD_REQUEST");
            return;
        }

        SaveSession session = activeSessions.remove(id);
        if (session == null) {
            call.reject("Sessão não encontrada", "NOT_FOUND");
            return;
        }

        new Thread(() -> {
            try {
                session.out.flush();
                session.out.close();

                TargetStream target = new TargetStream(null, session.uri, session.file);
                finalizeTarget(target);

                String toastText = customToast != null && !customToast.isEmpty()
                    ? customToast
                    : (isPt() ? "Salvo em Downloads: " + session.name : "Saved to Downloads: " + session.name);
                showToast(toastText);

                JSObject res = new JSObject();
                res.put("success", true);
                res.put("name", session.name);
                if (session.uri != null) {
                    res.put("uri", session.uri.toString());
                }
                if (session.file != null) {
                    res.put("path", session.file.getAbsolutePath());
                }
                call.resolve(res);
            } catch (Throwable e) {
                Log.e(TAG, "Falha ao finalizar salvamento de " + session.name, e);
                call.reject("Falha ao finalizar: " + e.getMessage(), "IO_ERROR");
            }
        }, "nadasai-save-finish").start();
    }

    @PluginMethod
    public void cancelSave(PluginCall call) {
        String id = call.getString("id");
        if (id == null) {
            call.reject("Falta id", "BAD_REQUEST");
            return;
        }

        SaveSession session = activeSessions.remove(id);
        if (session != null) {
            try {
                session.out.close();
            } catch (Exception ignored) {}

            try {
                if (session.uri != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    getContext().getContentResolver().delete(session.uri, null, null);
                } else if (session.file != null && session.file.exists()) {
                    session.file.delete();
                }
            } catch (Exception ignored) {}
        }

        JSObject res = new JSObject();
        res.put("cancelled", true);
        call.resolve(res);
    }

    private static class TargetStream {
        final OutputStream out;
        final Uri uri;
        final File file;

        TargetStream(OutputStream out, Uri uri, File file) {
            this.out = out;
            this.uri = uri;
            this.file = file;
        }
    }

    private TargetStream createTarget(String name, String mimeType) throws IOException {
        Context context = getContext();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentResolver resolver = context.getContentResolver();
            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
            values.put(MediaStore.MediaColumns.MIME_TYPE, mimeType);
            values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
            values.put(MediaStore.MediaColumns.IS_PENDING, 1);

            Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (uri != null) {
                OutputStream os = resolver.openOutputStream(uri);
                if (os != null) {
                    return new TargetStream(os, uri, null);
                }
            }
        }

        // Fallback para Android <= 28 ou caso MediaStore falhe
        File downloadDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
        if (!downloadDir.exists()) {
            downloadDir.mkdirs();
        }

        File target = getUniqueFile(downloadDir, name);
        OutputStream os = new FileOutputStream(target);
        return new TargetStream(os, null, target);
    }

    private void finalizeTarget(TargetStream target) {
        Context context = getContext();
        if (target.uri != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            try {
                ContentValues values = new ContentValues();
                values.put(MediaStore.MediaColumns.IS_PENDING, 0);
                context.getContentResolver().update(target.uri, values, null, null);
            } catch (Exception e) {
                Log.w(TAG, "Erro ao atualizar IS_PENDING", e);
            }
        }

        if (target.file != null) {
            try {
                MediaScannerConnection.scanFile(
                    context,
                    new String[]{ target.file.getAbsolutePath() },
                    null,
                    null
                );
            } catch (Exception e) {
                Log.w(TAG, "Erro ao notificar MediaScanner", e);
            }
        }
    }

    private File getUniqueFile(File dir, String name) {
        File file = new File(dir, name);
        if (!file.exists()) return file;

        String base = name;
        String ext = "";
        int dot = name.lastIndexOf('.');
        if (dot >= 0) {
            base = name.substring(0, dot);
            ext = name.substring(dot);
        }

        int count = 1;
        while (file.exists()) {
            file = new File(dir, base + " (" + count + ")" + ext);
            count++;
        }
        return file;
    }

    private String resolveMimeType(String name, String mimeType) {
        if (mimeType != null && !mimeType.isEmpty() && !mimeType.equals("application/octet-stream")) {
            return mimeType;
        }
        int dot = name.lastIndexOf('.');
        if (dot >= 0) {
            String ext = name.substring(dot + 1).toLowerCase();
            String fromMap = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
            if (fromMap != null) return fromMap;
            switch (ext) {
                case "png": return "image/png";
                case "jpg":
                case "jpeg": return "image/jpeg";
                case "webp": return "image/webp";
                case "svg": return "image/svg+xml";
                case "pdf": return "application/pdf";
                case "docx": return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
                case "mp3": return "audio/mpeg";
                case "wav": return "audio/wav";
                case "mp4": return "video/mp4";
                case "webm": return "video/webm";
                case "txt": return "text/plain";
                case "diff": return "text/x-diff";
            }
        }
        return "application/octet-stream";
    }

    private boolean isPt() {
        return Locale.getDefault().getLanguage().toLowerCase().startsWith("pt");
    }

    private void showToast(String message) {
        getActivity().runOnUiThread(() -> Toast.makeText(getContext(), message, Toast.LENGTH_LONG).show());
    }
}
