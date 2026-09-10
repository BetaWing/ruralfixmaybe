main = async () => {
    if (window.__multbot_captcha_active) return;
    try {
        const player_relation_models = uw.MM.getOnlyCollectionByName('FarmTownPlayerRelation').models;
        const farm_town_models       = uw.MM.getOnlyCollectionByName('FarmTown').models;
        const killpoints             = uw.MM.getModelByNameAndPlayerId('PlayerKillpoints').attributes;

        /* Rurais bloqueadas */
        const locked = player_relation_models.filter(m => m.attributes.relation_status === 0);

        /* Killpoints disponíveis */
        const available = killpoints.att + killpoints.def - killpoints.used;
        const unlocked  = player_relation_models.length - locked.length;

        /* ---------- FASE 1: desbloquear ---------- */
        if (locked.length > 0) {
            const discounts = [2, 8, 10, 30, 50, 100];
            if (unlocked < discounts.length && available < discounts[unlocked]) return;
            if (available < 100) return;

            const towns = this.generateList();
            for (const town_id of towns) {
                const town = uw.ITowns.towns[town_id];
                const x = town.getIslandCoordinateX();
                const y = town.getIslandCoordinateY();

                for (const farmtown of farm_town_models) {
                    if (farmtown.attributes.island_x !== x || farmtown.attributes.island_y !== y) continue;

                    for (const relation of locked) {
                        if (farmtown.attributes.id !== relation.attributes.farm_town_id) continue;

                        const ok = await this.unlockRural(
                            town_id,
                            relation.attributes.farm_town_id,
                            relation.id
                        );
                        if (ok) {
                            this.console.log('[AutoRuralLevel] ' + this.t('arl_unlocked_log', {
                                island: farmtown.attributes.island_xy,
                                name:   farmtown.attributes.name
                            }));
                        }
                        return; // 1 unlock por ciclo
                    }
                }
            }
            return;
        }

        /* ---------- FASE 2: subir nível ---------- */
        const towns      = this.generateList();
        const levelCosts = [1, 5, 25, 50, 100];
        const target     = Math.max(1, this.rural_level | 0); // respeita o setting (1..6)
        const now        = Math.floor(Date.now() / 1000);
        let anyExpanding = false;

        for (let level = 1; level <= target; level++) {
            // custo do upgrade para este nível; fallback = último conhecido
            const cost = levelCosts[level - 1] ?? levelCosts[levelCosts.length - 1];
            if (available < cost) return; // sem KP, espera pelo próximo tick

            for (const town_id of towns) {
                const town = uw.ITowns.towns[town_id];
                const x = town.getIslandCoordinateX();
                const y = town.getIslandCoordinateY();

                for (const farmtown of farm_town_models) {
                    if (farmtown.attributes.island_x !== x) continue;
                    if (farmtown.attributes.island_y !== y) continue;

                    for (const relation of player_relation_models) {
                        if (farmtown.attributes.id !== relation.attributes.farm_town_id) continue;

                        /* Expansão em curso? só salta ESTA rural, não aborta tudo */
                        if (relation.attributes.expansion_at && relation.attributes.expansion_at > now) {
                            anyExpanding = true;
                            continue;
                        }

                        /* Já está neste nível ou acima? salta */
                        if (relation.attributes.expansion_stage >= level) continue;

                        const ok = await this.upgradeRural(
                            town_id,
                            relation.attributes.farm_town_id,
                            relation.attributes.id
                        );

                        if (ok) {
                            this.console.log('[AutoRuralLevel] ' + this.t('arl_upgraded_log', {
                                island: farmtown.attributes.island_xy,
                                name:   farmtown.attributes.name
                            }));
                        }

                        return; // 1 upgrade por ciclo
                    }
                }
            }
        }

        /* Ainda há alguma rural a expandir → espera antes de desligar */
        if (anyExpanding) return;

        /* Todas as rurais atingiram o nível pretendido → desliga */
        this.toggle();
    } catch (e) {
        this.console.log('[AutoRuralLevel] ' + this.t('arl_main_error', { msg: e?.message ?? e }));
    }
};
