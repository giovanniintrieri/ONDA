package it.onda.player;
import org.junit.Test;
import java.util.*;
import static org.junit.Assert.*;
public class QueueOrderTest {
    @Test public void shufflePreservesUniqueTracksAndSelectedFirst(){
        List<String> ids=Arrays.asList("a","b","c","b","d");
        for(int seed=0;seed<50;seed++){
            List<String> order=QueueOrder.shuffled(ids,"c",new Random(seed));
            assertEquals("c",order.get(0));assertEquals(4,order.size());assertEquals(new HashSet<>(ids),new HashSet<>(order));
        }
    }
    @Test public void nextCycleAvoidsRepeatingTheLastTrackImmediately(){
        for(int seed=0;seed<50;seed++){
            List<String> order=QueueOrder.nextCycle(Arrays.asList("a","b","c"),"c",new Random(seed));
            assertNotEquals("c",order.get(0));assertEquals(3,new HashSet<>(order).size());
        }
    }
    @Test public void singleTrackAndEmptyQueueStayValid(){assertEquals(Collections.singletonList("a"),QueueOrder.nextCycle(Arrays.asList("a","a"),"a",new Random(1)));assertTrue(QueueOrder.nextCycle(Collections.emptyList(),null,new Random(1)).isEmpty());}
}
