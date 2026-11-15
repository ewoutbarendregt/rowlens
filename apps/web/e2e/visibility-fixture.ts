// Synthetic local fixture, enabled only by the dedicated Playwright server configuration.
import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { MediaStore, videoKey } from '../src/server/media/store.ts';
import { adminEmail, authEmail } from './env.ts';
export async function seedVisibility(ownerUrl: string, mediaRoot: string) {
  const db = new pg.Client({ connectionString: ownerUrl });
  await db.connect();
  try {
    const ids = (
      await db.query<{ id: string; slug: string }>(
        "insert into club(slug,name) values('visibility-alpha','Alpha testclub'),('visibility-beta','Beta testclub'),('visibility-gamma','Gamma voorbeeldclub') returning id,slug",
      )
    ).rows;
    const club = (slug: string) => {
      const found = ids.find((c) => c.slug === slug);
      if (!found) throw new Error('Missing fixture club');
      return found.id;
    };
    const alpha = club('visibility-alpha'),
      beta = club('visibility-beta'),
      gamma = club('visibility-gamma');
    const [member, other] = (
      await db.query<{ id: string }>(
        "insert into app_user(email,display_name,first_name,last_name,verified_at) values($1,'Test Rower','Test','Rower',now()),('other.visibility@example.test','Other Rower','Other','Rower',now()) returning id",
        [authEmail],
      )
    ).rows;
    if (!member || !other) throw new Error('Missing fixture accounts');
    const platform = (
      await db.query<{ id: string }>('select id from app_user where email=$1', [adminEmail])
    ).rows[0];
    if (!platform) throw new Error('Missing platform account');
    await db.query(
      "insert into membership(club_id,user_id,roles) values($1,$3,ARRAY['rower']),($2,$3,ARRAY['rower']),($1,$4,ARRAY['rower'])",
      [alpha, beta, member.id, other.id],
    );
    await db.query('update app_user set primary_club_id=$1 where id=$2', [beta, member.id]);
    const person = (
      await db.query<{ id: string }>(
        "insert into rower(club_id,user_id,display_name) values($1,$2,'Test Rower') returning id",
        [alpha, member.id],
      )
    ).rows[0];
    if (!person) throw new Error('Missing fixture rower');
    const create = async (cid: string, title: string, maker: string) => {
      const r = await db.query<{ id: string }>(
        "insert into rowing_session(club_id,title,session_date,created_by_user_id) values($1,$2,'2026-11-15',$3) returning id",
        [cid, title, maker],
      );
      const id = r.rows[0]?.id;
      if (!id) throw new Error('Missing fixture training');
      return id;
    };
    await create(alpha, 'Eigen Alpha', member.id);
    await create(beta, 'Eigen Beta', member.id);
    await create(alpha, 'Onzichtbare training', other.id);
    const crew = await create(alpha, 'Deelname als stuurman', other.id);
    await db.query('insert into lineup_seat(club_id,session_id,seat,rower_id) values($1,$2,0,$3)', [
      alpha,
      crew,
      person.id,
    ]);
    await db.query('begin');
    await db.query("select set_config('app.user_id',$1,true)", [platform.id]);
    const example = await create(gamma, 'RowLens voorbeeld', platform.id);
    await db.query('commit');
    const clip = (
      await db.query<{ id: string; asset_id: string }>(
        "insert into video(club_id,session_id,original_filename,content_type,perspective,size_bytes,status,frame_count,fps_num,fps_den,width,height,duration_ms) values($1,$2,'synthetic.webm','video/webm','bank',1,'ready',120,30,1,640,360,4000) returning id,asset_id",
        [gamma, example],
      )
    ).rows[0];
    if (!clip) throw new Error('Missing fixture video');
    const bytes = await readFile(new URL('../public/demo-media/e2e-boat.webm', import.meta.url));
    const key = videoKey(gamma, clip.asset_id) + '/play-540';
    await new MediaStore(mediaRoot).append(key, Readable.from(bytes), bytes.length);
    await db.query('update video set renditions=$1::jsonb where id=$2', [
      JSON.stringify([
        {
          name: 'play-540',
          key,
          width: 640,
          height: 360,
          bytes: bytes.length,
          contentType: 'video/webm',
        },
      ]),
      clip.id,
    ]);
    await db.query(
      "insert into stroke_mark(club_id,video_id,frame,kind) values($1,$2,10,'catch'),($1,$2,25,'finish'),($1,$2,55,'catch')",
      [gamma, clip.id],
    );
    await db.query(
      "insert into annotation(club_id,video_id,frame,kind,body,author_name) values($1,$2,10,'note','Hidden private fixture','Synthetic')",
      [gamma, clip.id],
    );
  } finally {
    await db.end();
  }
}
