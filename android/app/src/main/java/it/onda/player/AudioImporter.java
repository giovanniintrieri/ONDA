package it.onda.player;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.util.Base64;
import org.json.JSONObject;
import java.io.*;
import java.security.MessageDigest;
import java.util.*;

public final class AudioImporter {
    private final Context context;
    private final LibraryStore store;
    private final Map<String,File> uploads=new HashMap<>();
    private final Map<String,String> names=new HashMap<>();
    public AudioImporter(Context context) {this.context=context.getApplicationContext();store=LibraryStore.get(context);}
    public static boolean isAudio(String name,String mime) {return (mime!=null && mime.startsWith("audio/")) || name.toLowerCase(Locale.ROOT).matches(".*\\.(mp3|mp4|m4a|flac|wav|aac|ogg|opus|aif|aiff)$");}
    public String begin(String name) throws IOException {
        String token=UUID.randomUUID().toString();uploads.put(token,File.createTempFile("onda-import-",".part",context.getCacheDir()));names.put(token,name);return token;
    }
    public void append(String token,String data) throws IOException {
        File file=uploads.get(token);if(file==null)throw new IOException("Importazione scaduta");
        if(data.length()>200_000)throw new IOException("Blocco audio troppo grande");
        try(OutputStream out=new FileOutputStream(file,true)){out.write(Base64.decode(data,Base64.NO_WRAP));}
    }
    public void cancel(String token) {File f=uploads.remove(token);names.remove(token);if(f!=null)f.delete();}
    public JSONObject finish(String token,JSONObject overrides) throws Exception {
        File f=uploads.get(token);if(f==null)throw new IOException("Importazione scaduta");
        try{return commit(f,names.get(token),overrides);}finally{cancel(token);}
    }
    public JSONObject importUri(Uri uri,String name) throws Exception {
        File temp=File.createTempFile("onda-import-",".part",context.getCacheDir());
        try(InputStream in=context.getContentResolver().openInputStream(uri);OutputStream out=new FileOutputStream(temp)) {
            if(in==null)throw new IOException("File non leggibile");byte[] buffer=new byte[64*1024];int n;
            while((n=in.read(buffer))!=-1)out.write(buffer,0,n);
        }catch(Exception e){temp.delete();throw e;}
        try{return commit(temp,name,new JSONObject());}finally{temp.delete();}
    }
    private JSONObject commit(File temp,String filename,JSONObject overrides) throws Exception {
        if(temp.length()==0)throw new IOException("File audio vuoto");
        MessageDigest digest=MessageDigest.getInstance("SHA-256");
        try(InputStream in=new FileInputStream(temp)){byte[] buf=new byte[64*1024];int n;while((n=in.read(buf))!=-1)digest.update(buf,0,n);}
        StringBuilder hex=new StringBuilder();for(byte b:digest.digest())hex.append(String.format(Locale.ROOT,"%02x",b&255));String id=hex.toString();
        if(store.read("tracks",id)!=null)return null;
        String name=filename==null?"Brano":filename;String stem=name.replaceFirst("\\.[^.]+$","").replace('_',' ');int separator=stem.indexOf(" - ");
        JSONObject t=new JSONObject().put("id",id).put("title",separator<0?stem:stem.substring(separator+3)).put("artist",separator<0?"Artista sconosciuto":stem.substring(0,separator))
            .put("album","").put("genre","").put("duration",0).put("size",temp.length()).put("filename",name)
            .put("format",name.contains(".")?name.substring(name.lastIndexOf('.')+1).toUpperCase(Locale.ROOT):"AUDIO")
            .put("addedAt",System.currentTimeMillis()).put("liked",false).put("plays",0).put("skips",0).put("lastPlayed",0);
        MediaMetadataRetriever reader=new MediaMetadataRetriever();
        try {
            reader.setDataSource(temp.getAbsolutePath());
            String[] fields={"title","artist","album","genre"};int[] keys={MediaMetadataRetriever.METADATA_KEY_TITLE,MediaMetadataRetriever.METADATA_KEY_ARTIST,MediaMetadataRetriever.METADATA_KEY_ALBUM,MediaMetadataRetriever.METADATA_KEY_GENRE};
            for(int i=0;i<fields.length;i++){String value=reader.extractMetadata(keys[i]);if(value!=null&&!value.trim().isEmpty())t.put(fields[i],value);}
            String duration=reader.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION);if(duration!=null)t.put("duration",Double.parseDouble(duration)/1000.0);
            byte[] cover=reader.getEmbeddedPicture();
            if(cover!=null&&cover.length<=10_000_000){
                BitmapFactory.Options o=new BitmapFactory.Options();o.inJustDecodeBounds=true;BitmapFactory.decodeByteArray(cover,0,cover.length,o);
                o.inSampleSize=1;while(Math.max(o.outWidth,o.outHeight)/o.inSampleSize>768)o.inSampleSize*=2;o.inJustDecodeBounds=false;
                Bitmap bitmap=BitmapFactory.decodeByteArray(cover,0,cover.length,o);
                if(bitmap!=null){try(OutputStream out=new FileOutputStream(LibraryStore.coverFile(context,id))){bitmap.compress(Bitmap.CompressFormat.JPEG,85,out);}finally{bitmap.recycle();}
                    t.put("coverUrl","https://appassets.androidplatform.net/covers/"+id+".jpg");}
            }
        }catch(Exception e){android.util.Log.w("Onda","Metadati non disponibili; conservo il file audio",e);}finally{reader.release();}
        for(String field:new String[]{"title","artist","album","genre"})if(overrides.has(field))t.put(field,overrides.getString(field));
        File destination=LibraryStore.mediaFile(context,id);
        synchronized(store) {
        if(store.read("tracks",id)!=null)return null;
        try {
            if(!temp.renameTo(destination))try(InputStream in=new FileInputStream(temp);OutputStream out=new FileOutputStream(destination)){byte[] buf=new byte[64*1024];int n;while((n=in.read(buf))!=-1)out.write(buf,0,n);}
            store.put("tracks",id,t);return t;
        } catch(Exception e){destination.delete();LibraryStore.coverFile(context,id).delete();throw e;}
        }
    }
    public void close(){for(String token:new ArrayList<>(uploads.keySet()))cancel(token);}
}
