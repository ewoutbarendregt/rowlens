// Additional synthetic members and an ordinary training video for sharing checks.
import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { MediaStore, videoKey } from '../src/server/media/store.ts';
import { authEmail } from './env.ts';
export async function seedSharing(ownerUrl: string, mediaRoot: string) {
  const db = new pg.Client({ connectionString: ownerUrl });
  await db.connect();
  try {
    const [club] = (
      await db.query<{ id: string }>("select id from club where slug='visibility-alpha'")
    ).rows;
    const [session] = (
      await db.query<{ id: string; created_by_user_id: string }>(
        "select id,created_by_user_id from rowing_session where title='Eigen Alpha'",
      )
    ).rows;
    if (!club || !session) throw new Error('Missing visibility sharing fixture');
    for (const [email, first, last, roles] of [
      ['recipient.sharing.e2e@example.test', 'Mila', 'Ontvanger', ['rower']],
      ['other.sharing.e2e@example.test', 'Noor', 'Clubgenoot', ['rower']],
      ['coach.sharing.e2e@example.test', 'Karel', 'Coach', ['coach']],
    ] as const) {
      const [u] = (
        await db.query<{ id: string }>(
          'insert into app_user(email,display_name,first_name,last_name,verified_at) values($1,$2,$3,$4,now()) returning id',
          [email, `${first} ${last}`, first, last],
        )
      ).rows;
      if (!u) throw new Error('Missing synthetic recipient');
      await db.query('insert into membership(club_id,user_id,roles) values($1,$2,$3)', [
        club.id,
        u.id,
        [...roles],
      ]);
    }
    const [clip] = (
      await db.query<{ id: string; asset_id: string }>(
        "insert into video(club_id,session_id,original_filename,content_type,perspective,size_bytes,status,frame_count,fps_num,fps_den,width,height,duration_ms) values($1,$2,'sharing.webm','video/webm','bank',1,'ready',120,30,1,640,360,4000) returning id,asset_id",
        [club.id, session.id],
      )
    ).rows;
    if (!clip) throw new Error('Missing sharing video');
    const data = await readFile(new URL('../public/demo-media/e2e-boat.webm', import.meta.url));
    const key = videoKey(club.id, clip.asset_id) + '/play-540';
    await new MediaStore(mediaRoot).append(key, Readable.from(data), data.length);
    await db.query('update video set renditions=$1::jsonb where id=$2', [
      JSON.stringify([
        {
          name: 'play-540',
          key,
          width: 640,
          height: 360,
          bytes: data.length,
          contentType: 'video/webm',
        },
      ]),
      clip.id,
    ]);
    await db.query(
      "insert into annotation(club_id,video_id,frame,kind,body,author_name,author_user_id) values($1,$2,1,'note','Privé voor maker','Synthetic',$3)",
      [club.id, clip.id, session.created_by_user_id],
    );
    // The account used by the owner remains rower-only in both memberships.
    await db.query(
      "update membership set roles=ARRAY['rower'] where user_id=(select id from app_user where email=$1)",
      [authEmail],
    );
  } finally {
    await db.end();
  }
}
