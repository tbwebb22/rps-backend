import { fetchQuery } from "@airstack/node";

export async function fetchTokenBalance(fid: string) {
    const query = `query MyQuery {
        MoxieUserPortfolios(
            input: {filter: {fanTokenAddress: {_eq: "0xf41f49a7cea54df54448b1c18ff429c7b332afb6"}, fid: {_eq: "${fid}"}}, blockchain: ALL}
        ) {
            MoxieUserPortfolio {
            totalLockedAmount
            totalUnlockedAmount
            }
        }
    }`;

    const { data, error } = await fetchQuery(query);

    if (error) {
        console.error('Error fetching user details:', error);
        throw error;
    }

    if(!data || !data.MoxieUserPortfolios || !data.MoxieUserPortfolios.MoxieUserPortfolio) return 0;

    return data.MoxieUserPortfolios.MoxieUserPortfolio[0].totalLockedAmount + data.MoxieUserPortfolios.MoxieUserPortfolio[0].totalUnlockedAmount;
}

export async function fetchUserDetails(fid: number) {
    const query = `query MyQuery {
        Socials(
            input: {
            filter: { dappName: { _eq: farcaster }, identity: { _eq: "fc_fid:${fid}" } }
            blockchain: ethereum
            }
        ) {
            Social {
            profileDisplayName
            profileImage
            profileName
            }
        }
    }`;

    const { data, error } = await fetchQuery(query);

    if (error) {
        console.error('Error fetching user details:', error);
        throw error;
    }

    return data;
}

// export async function fetchUserRecentCasts(fid: number) {
//     const query = `query MyQuery {
//         FarcasterCasts(
//             input: {
//             filter: {
//                 castedAtTimestamp: {_gte: "${new Date(Date.now() - 360 * 60 * 1000).toISOString()}"},
//                 castedBy: { _eq: "fc_fid:${fid}" }
//             },
//             blockchain: ALL
//             }
//         ) {
//             Cast {
//             castedAtTimestamp
//             embeds
//             url
//             text
//             numberOfRecasts
//             numberOfLikes
//             channel {
//                 channelId
//             }
//             mentions {
//                 fid
//                 position
//             }
//             }
//         }
//     }`;

//     console.log('query', query);

//     const { data, error } = await fetchQuery(query);

//     if (error) {
//         console.error('Error fetching user recent casts', error);
//         throw error;
//     }

//     return data;
// }