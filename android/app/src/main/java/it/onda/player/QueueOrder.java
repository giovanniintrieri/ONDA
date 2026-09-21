package it.onda.player;
import java.util.*;
/** Independent of Android so repeat/shuffle rules can be tested on the JVM. */
public final class QueueOrder {
    private QueueOrder(){}
    public static List<String> unique(List<String> ids){return new ArrayList<>(new LinkedHashSet<>(ids));}
    public static List<String> shuffled(List<String> ids,String first,Random random){
        List<String> result=unique(ids);Collections.shuffle(result,random);
        if(first!=null&&result.remove(first))result.add(0,first);return result;
    }
    public static List<String> nextCycle(List<String> ids,String last,Random random){
        List<String> result=shuffled(ids,null,random);
        if(result.size()>1&&result.get(0).equals(last))Collections.swap(result,0,1+random.nextInt(result.size()-1));return result;
    }

    public static final class Details {
        final String artist;
        final long lastPlayed;
        public Details(String artist, long lastPlayed) {
            this.artist = artist.trim().toLowerCase(Locale.ROOT);
            this.lastPlayed = lastPlayed;
        }
    }
    private static final class Ranked {
        final String id, artist;
        final double rank;
        Ranked(String id, String artist, double rank) { this.id=id; this.artist=artist; this.rank=rank; }
    }
    /** Weighted sampling without replacement, O(n log n), with artist spacing. */
    public static List<String> smart(List<String> ids, String first, String previous,
            Map<String, Details> details, Random random, long now) {
        Map<String, PriorityQueue<Ranked>> groups = new LinkedHashMap<>();
        Comparator<Ranked> ranking = Comparator.comparingDouble((Ranked r) -> r.rank).thenComparing(r -> r.id);
        List<String> result = new ArrayList<>();
        for (String id : unique(ids)) {
            if (id.equals(first)) { result.add(id); continue; }
            Details d = details.getOrDefault(id, new Details("", 0));
            String artist = d.artist.isEmpty() || d.artist.equals("artista sconosciuto") || d.artist.equals("unknown artist") ? "id:"+id : d.artist;
            long age = Math.max(0, now - d.lastPlayed);
            double weight = d.lastPlayed <= 0 ? 1 : age < 6*3_600_000L ? .12 : age < 86_400_000L ? .35 : age < 7*86_400_000L ? .7 : 1;
            double rank = -Math.log(Math.max(1e-12, random.nextDouble())) / weight;
            groups.computeIfAbsent(artist, k -> new PriorityQueue<>(ranking)).add(new Ranked(id, artist, rank));
        }
        PriorityQueue<PriorityQueue<Ranked>> candidates = new PriorityQueue<>((a,b) -> ranking.compare(a.peek(), b.peek()));
        candidates.addAll(groups.values());
        String priorId = result.isEmpty() ? previous : first;
        Details prior = details.get(priorId);
        String lastArtist = prior == null ? "" : prior.artist;
        while (!candidates.isEmpty()) {
            PriorityQueue<Ranked> chosen = candidates.poll(), deferred = null;
            if (chosen.peek().artist.equals(lastArtist) && !candidates.isEmpty()) { deferred=chosen; chosen=candidates.poll(); }
            Ranked next = chosen.poll(); result.add(next.id); lastArtist=next.artist;
            if (!chosen.isEmpty()) candidates.add(chosen);
            if (deferred != null) candidates.add(deferred);
        }
        if (first == null && result.size() > 1 && result.get(0).equals(previous)) Collections.swap(result, 0, 1);
        return result;
    }
}
