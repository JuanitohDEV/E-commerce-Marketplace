// ---------------- paginate --------------------
// Reusable pagination helper for any Mongoose query

const paginate = async (Model, filter = {}, options = {}) => {
    const {
        page = 1,
        limit = 20,
        sort = { createdAt: -1 },
        populate = null,
        select = null,
    } = options;

    const skip = (page - 1) * limit;

    let query = Model.find(filter).sort(sort).skip(skip).limit(Number(limit));

    if (populate) query = query.populate(populate);
    if (select) query = query.select(select);

    const [data, total] = await Promise.all([
        query,
        Model.countDocuments(filter),
    ]);

    return {
        data,
        pagination: {
            page: Number(page),
            limit: Number(limit),
            totalItems: total,
            totalPages: Math.ceil(total / limit),
            hasNextPage: page * limit < total,
            hasPrevPage: page > 1,
        },
    };
};

module.exports = paginate;