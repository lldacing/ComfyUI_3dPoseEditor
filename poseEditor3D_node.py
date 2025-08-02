import hashlib
import os
from PIL import Image
import torch
import numpy as np
import folder_paths

# Directory node save settings
CHUNK_SIZE = 1024
dir_painter_node = os.path.dirname(__file__)
extension_path = os.path.join(os.path.abspath(dir_painter_node))

class PoseEditor3D(object):
    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(self):
        temp_dir = folder_paths.get_temp_directory()
        temp_dir = os.path.join(temp_dir, '3dposeeditor')

        if not os.path.isdir(temp_dir):
            os.makedirs(temp_dir)

        return {
            "optional": {
                # 宽高解决进页面时节点不在可视区域获取获取不到正确的图片问题
                "width": ("INT", {"default": 512, "min": 1, "max": 2048}),
                "height": ("INT", {"default": 512, "min": 1, "max": 2048}),
                "pose": ("STRING", {"default": "", "read_only": True, "dynamicPrompts": False}),
                "depth": ("STRING", {"default": "", "read_only": True, "dynamicPrompts": False}),
                "normal": ("STRING", {"default": "", "read_only": True, "dynamicPrompts": False}),
                "canny": ("STRING", {"default": "", "read_only": True, "dynamicPrompts": False}),
            },
        }

    RETURN_TYPES = ("IMAGE","IMAGE","IMAGE","IMAGE",)
    RETURN_NAMES = ("OpenPose", "Depth", "Normal", "Canny",)
    FUNCTION = "output_pose"

    CATEGORY = "image"

    def output_pose(self, width=None, height=None, pose=None, depth=None, normal=None, canny=None):
        if pose is None:
            return (None, None, None, None,)

        temp_dir = folder_paths.get_temp_directory()
        temp_dir = os.path.join(temp_dir, '3dposeeditor')

        image_path = os.path.join(temp_dir, pose)

        i = Image.open(image_path)
        poseImage = i.convert("RGB")
        poseImage = np.array(poseImage).astype(np.float32) / 255.0
        poseImage = torch.from_numpy(poseImage)[None,]

        image_path = os.path.join(temp_dir, depth)

        i = Image.open(image_path)
        depthImage = i.convert("RGB")
        depthImage = np.array(depthImage).astype(np.float32) / 255.0
        depthImage = torch.from_numpy(depthImage)[None,]

        image_path = os.path.join(temp_dir, normal)

        i = Image.open(image_path)
        normalImage = i.convert("RGB")
        normalImage = np.array(normalImage).astype(np.float32) / 255.0
        normalImage = torch.from_numpy(normalImage)[None,]

        image_path = os.path.join(temp_dir, canny)

        i = Image.open(image_path)
        cannyImage = i.convert("RGB")
        cannyImage = np.array(cannyImage).astype(np.float32) / 255.0
        cannyImage = torch.from_numpy(cannyImage)[None,]

        return poseImage, depthImage, normalImage, cannyImage,

    @classmethod
    def IS_CHANGED(cls, width=None, height=None, pose=None, depth=None, normal=None, canny=None):
        if pose is None:
            return False

        temp_dir = folder_paths.get_temp_directory()
        temp_dir = os.path.join(temp_dir, '3dposeeditor')

        image_path = os.path.join(temp_dir, pose)
        # print(f'Change: {image_path}')

        m = hashlib.sha256()
        with open(image_path, 'rb') as f:
            m.update(f.read())
        return m.digest().hex()

NODE_CLASS_MAPPINGS = {
    "Hina.PoseEditor3D": PoseEditor3D
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "Hina.PoseEditor3D": "3D Pose Editor"
}