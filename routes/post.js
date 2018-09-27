const Post = require("../models/post");
const Comment = require("../models/comment");
const User = require("../models/user");
const multer = require("multer");
const cloudinary = require("cloudinary");

const storage = multer.diskStorage({
  filename: function(req, file, callback) {
    callback(null, Date.now() + file.originalname);
  }
});

const imageFilter = function(req, file, cb) {
  // accept image files only
  if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/i)) {
    return cb(new Error("Only image files are allowed!"), false);
  }
  cb(null, true);
};

const upload = multer({
  storage: storage,
  fileFilter: imageFilter
});

cloudinary.config({
  cloud_name: "dmrien29n",
  api_key: process.env.API_KEY,
  api_secret: process.env.API_SECRET
});

module.exports = router => {
  // get all posts
  router.get("/posts", (req, res) => {
    Post.find({})
      .sort({ timePosted: -1 })
      .populate("comments")
      .populate("likes")
      .then(posts => {
        res.json(posts);
      })
      .catch(err => {
        res.json(err);
      });
  });

  // create new post
  router.post("/posts", upload.single("file"), (req, res) => {
    cloudinary.v2.uploader.upload(
      req.file.path,
      { width: 1000, height: 1000, crop: "scale" },
      (err, result) => {
        if (err) {
          return res.json(err);
        }
        const { caption, authorId, username, avatar } = req.body;
        const public_id = result.public_id;
        const secure_url = result.secure_url;
        const newPost = {
          image: secure_url,
          imageId: public_id,
          description: caption ? caption : "",
          author: {
            id: authorId,
            username: username,
            avatar: avatar
          }
        };
        Post.create(newPost)
          .then(post => {
            res.json(post);
          })
          .catch(err => {
            res.json(err);
          });
      }
    );
  });

  // get post by id
  router.get("/posts/:post_id", (req, res) => {
    Post.findOne({ _id: req.params.post_id })
      .populate("comments")
      .populate("likes")
      .then(post => {
        if (post) {
          res.json(post);
        }
      })
      .catch(err => {
        res.json({ message: "Post doesn't exist" });
      });
  });

  // update post
  router.put("/posts/:post_id", upload.single("file"), (req, res) => {
    const caption = req.body.caption ? req.body.caption : "";
    Post.findOne({ _id: req.params.post_id }, { description: caption })
      .then(async post => {
        if (req.file) {
          await cloudinary.v2.uploader.destroy(post.imageId);
          const result = await cloudinary.v2.uploader.upload(req.file.path, {
            width: 1000,
            height: 1000,
            crop: "scale"
          });
          post.imageId = result.public_id;
          post.image = result.secure_url;
        }
        post.save();
        res.json(post);
      })
      .catch(err => {
        res.json({ message: "Error editing your post" });
      });
  });

  // delete a post
  router.delete("/posts/:post_id", (req, res) => {
    Post.findOne({ _id: req.params.post_id })
      .then(async post => {
        if (String(post.author.id) === String(req.user._id)) {
          console.log("yep this is your post");
          await Comment.deleteMany({ _id: { $in: post.comments } });
          return post;
        }
      })
      .then(post => {
        cloudinary.v2.uploader.destroy(post.imageId);
        return post;
      })
      .then(post => {
        return Post.deleteOne({ _id: post._id });
      })
      .then(response => {
        res.json(response);
      })
      .catch(err => {
        res.json(err);
      });
  });

  // like a post
  router.post("/posts/:post_id/likes", (req, res) => {
    let newLike = {};
    Post.findOne({ _id: req.params.post_id })
      .populate("comments")
      .populate("likes")
      .then(async post => {
        const user = await User.findOne({ _id: req.user._id });

        let like = {
          userId: user._id,
          username: user.username,
          avatar: user.avatar
        };
        post.likes.push(like);
        post.save();
        console.log(post);
        const data = {
          post,
          newLike
        };
        res.json(data);
      })
      .catch(err => {
        res.json(err);
      });
  });

  // dislike a post
  router.delete("/posts/:post_id/likes/:like_id", (req, res) => {
    Post.findOneAndUpdate(
      { _id: req.params.post_id },
      {
        $pull: { likes: { $in: { $in: [req.params.like_id] } } }
      }
    )
      .then(post => {
        return Post.findOne({ _id: post._id })
          .populate("comments")
          .populate("likes");
      })
      .then(newPost => {
        res.json(newPost);
      })
      .catch(err => {
        res.json(err);
      });
  });
};
