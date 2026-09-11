import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDatabase } from '../../db/test-helpers';
import { categories, publishers, games } from '../../db/schema';
import type { Database } from './db';
import {
    getAllGames,
    getAllCategories,
    getAllGameIds,
    getAllPublishers,
    getGames,
    getGameById,
} from './games';

async function seedGames(db: Database, count: number): Promise<void> {
    const [category] = await db
        .insert(categories)
        .values({ name: 'Strategy', description: 'cat' })
        .returning({ id: categories.id });
    const [publisher] = await db
        .insert(publishers)
        .values({ name: 'Pub One', description: 'pub' })
        .returning({ id: publishers.id });

    // Insert titles in reverse-alphabetical order to prove ordering is applied.
    for (let i = count; i >= 1; i--) {
        await db.insert(games).values({
            title: `Game ${String(i).padStart(2, '0')}`,
            description: `Description ${i}`,
            starRating: 4.2,
            categoryId: category.id,
            publisherId: publisher.id,
        });
    }
}

async function seedFilterFixtures(db: Database): Promise<{
    categoryIds: number[];
    publisherIds: number[];
}> {
    const categoryRows = await db
        .insert(categories)
        .values([
            { name: 'Strategy', description: 'strategy' },
            { name: 'Puzzle', description: 'puzzle' },
        ])
        .returning({ id: categories.id });
    const publisherRows = await db
        .insert(publishers)
        .values([
            { name: 'Beta Games', description: 'beta' },
            { name: 'Alpha Games', description: 'alpha' },
        ])
        .returning({ id: publishers.id });

    await db.insert(games).values([
        {
            title: 'Puzzle Alpha',
            description: 'Puzzle',
            starRating: 4,
            categoryId: categoryRows[1].id,
            publisherId: publisherRows[1].id,
        },
        {
            title: 'Strategy Alpha',
            description: 'Strategy',
            starRating: 4,
            categoryId: categoryRows[0].id,
            publisherId: publisherRows[1].id,
        },
        {
            title: 'Strategy Beta',
            description: 'Strategy',
            starRating: 4,
            categoryId: categoryRows[0].id,
            publisherId: publisherRows[0].id,
        },
    ]);

    return {
        categoryIds: categoryRows.map((row) => row.id),
        publisherIds: publisherRows.map((row) => row.id),
    };
}

describe('games data-access helpers', () => {
    let db: Database;

    beforeEach(async () => {
        db = await createTestDatabase();
    });

    it('returns all games ordered by title', async () => {
        await seedGames(db, 3);
        const all = await getAllGames(db);
        expect(all.map((g) => g.title)).toEqual(['Game 01', 'Game 02', 'Game 03']);
        expect(all[0].category).toEqual({ id: expect.any(Number), name: 'Strategy' });
        expect(all[0].publisher).toEqual({ id: expect.any(Number), name: 'Pub One' });
    });

    it('returns all game ids ordered by title', async () => {
        await seedGames(db, 3);
        const ids = await getAllGameIds(db);
        const all = await getAllGames(db);
        expect(ids).toEqual(all.map((g) => g.id));
    });

    it('filters games by category and publisher together', async () => {
        const { categoryIds, publisherIds } = await seedFilterFixtures(db);

        const strategyGames = await getGames(db, { categoryIds: [categoryIds[0]!] });
        expect(strategyGames.map((game) => game.title)).toEqual(['Strategy Alpha', 'Strategy Beta']);

        const betaGames = await getGames(db, { publisherId: publisherIds[0]! });
        expect(betaGames.map((game) => game.title)).toEqual(['Strategy Beta']);

        const combined = await getGames(db, {
            categoryIds: [categoryIds[0]!, categoryIds[1]!],
            publisherId: publisherIds[1]!,
        });
        expect(combined.map((game) => game.title)).toEqual(['Puzzle Alpha', 'Strategy Alpha']);
    });

    it('returns all games when no filters are selected', async () => {
        await seedFilterFixtures(db);

        expect((await getGames(db, { categoryIds: [] })).map((game) => game.title)).toEqual([
            'Puzzle Alpha',
            'Strategy Alpha',
            'Strategy Beta',
        ]);
    });

    it('returns categories and publishers ordered by name', async () => {
        await seedFilterFixtures(db);

        expect((await getAllCategories(db)).map((category) => category.name)).toEqual(['Puzzle', 'Strategy']);
        expect((await getAllPublishers(db)).map((publisher) => publisher.name)).toEqual(['Alpha Games', 'Beta Games']);
    });

    it('fetches a single game by id', async () => {
        await seedGames(db, 2);
        const ids = await getAllGameIds(db);
        const game = await getGameById(db, ids[0]);
        expect(game?.title).toBe('Game 01');
    });

    it('returns null for a non-existent game', async () => {
        await seedGames(db, 2);
        expect(await getGameById(db, 99999)).toBeNull();
    });
});
